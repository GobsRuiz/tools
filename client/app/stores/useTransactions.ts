import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuid } from 'uuid'
import type { Transaction, Recurrent } from '~/schemas/zod-schemas'
import { assertTransactionBusinessRules } from '~~/schemas/transaction-business-rules'
import { createAtomicOperationError } from '~/utils/atomic-error'
import { apiGet, apiPost, apiPatch, apiDelete } from '~/utils/api'
import { addMonths, monthKey, nowISO } from '~/utils/dates'
import { CREDIT_CARD_BLANK_MESSAGE, CREDIT_CARD_PAIR_MESSAGE, hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { computeCreditInvoiceCycleMonth } from '~/utils/invoice-cycle'
import { useAccountsStore } from './useAccounts'

export const useTransactionsStore = defineStore('transactions', () => {
  const transactions = ref<Transaction[]>([])
  const paymentInFlight = ref<Set<string>>(new Set())

  function validateTransactionBusinessRules(tx: Pick<Transaction, 'accountId' | 'destinationAccountId' | 'type' | 'payment_method' | 'amount_cents'>) {
    assertTransactionBusinessRules(tx)
  }

  function ensureCreditAccountConfigured(accountId: number, paymentMethod?: 'debit' | 'credit') {
    if (paymentMethod !== 'credit') return

    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find(item => item.id === accountId)

    if (!account) {
      throw new Error('Selecione uma conta válida para cartão de crédito.')
    }

    if (!hasCompleteCreditCardConfig(account)) {
      throw new Error(`${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`)
    }
  }

  function resolveRecurringDate(month: string, referenceDay?: number): string {
    const match = /^(\d{4})-(\d{2})$/.exec(month)
    if (!match) return `${month}-01`

    const year = Number(match[1])
    const monthNumber = Number(match[2])
    const defaultDate = `${match[1]}-${match[2]}-01`

    if (!referenceDay || !Number.isFinite(referenceDay)) return defaultDate

    const daysInMonth = new Date(year, monthNumber, 0).getDate()
    const day = Math.min(Math.max(Math.trunc(referenceDay), 1), daysInMonth)

    return `${match[1]}-${match[2]}-${String(day).padStart(2, '0')}`
  }

  async function loadTransactions(filters?: Record<string, string>) {
    transactions.value = await apiGet<Transaction[]>('/transactions', filters)
  }

  /** Deriva o campo `paid` automaticamente com base no tipo e método */
  function derivePaid(type: Transaction['type'], method?: 'debit' | 'credit'): boolean {
    if (type === 'income') return true
    if (type === 'transfer') return method !== 'credit'
    return method === 'debit'
  }

  /** Transações não pagas de um mês específico (YYYY-MM) */
  function unpaidForMonth(month: string): Transaction[] {
    return transactions.value.filter(t => !t.paid && monthKey(t.date) === month)
  }

  /** Verifica se já existe transação criada a partir de um recorrente num mês */
  function hasRecurrentTransaction(recurrentId: string, month: string): boolean {
    return transactions.value.some((t) => {
      if (t.recurrentId !== recurrentId) return false
      if (monthKey(t.date) === month) return true
      // Fallback para registros legados com data invalida (ex.: 2026-02-30).
      return typeof t.date === 'string' && t.date.slice(0, 7) === month
    })
  }

  /**
   * Agrupa transações de crédito por conta no mês.
   * status:
   * - all: inclui pagas e pendentes
   * - open: somente pendentes
   * - paid: somente pagas
   */
  function creditInvoicesByAccount(month: string, status: 'all' | 'open' | 'paid' = 'all') {
    const accountsStore = useAccountsStore()
    const accountById = new Map(accountsStore.accounts.map(acc => [acc.id, acc]))

    const grouped = new Map<number, Transaction[]>()
    for (const tx of transactions.value) {
      if (tx.payment_method !== 'credit') continue

      const account = accountById.get(tx.accountId)
      if (!hasCompleteCreditCardConfig(account)) continue

      const cycleMonth = computeCreditInvoiceCycleMonth(tx.date, account.card_closing_day)
      if (!cycleMonth || cycleMonth !== month) continue

      if (status === 'open' && tx.paid) continue
      if (status === 'paid' && !tx.paid) continue

      const list = grouped.get(tx.accountId) ?? []
      list.push(tx)
      grouped.set(tx.accountId, list)
    }

    return grouped
  }

  /** Paga/Lanca um recorrente no mes */
  async function payRecurrent(rec: Recurrent, month: string) {
    const existing = transactions.value.find((t) =>
      t.recurrentId === rec.id
      && (monthKey(t.date) === month || (typeof t.date === 'string' && t.date.slice(0, 7) === month)),
    )
    if (existing) return existing

    const referenceDay = rec.due_day ?? rec.day_of_month
    const date = resolveRecurringDate(month, referenceDay)

    const type: Transaction['type'] = rec.kind === 'expense' ? 'expense' : 'income'
    const paymentMethod: Transaction['payment_method'] =
      type === 'expense' ? (rec.payment_method ?? 'debit') : undefined
    ensureCreditAccountConfigured(rec.accountId, paymentMethod)
    const paid = type === 'expense' ? paymentMethod === 'debit' : true

    let tx: Transaction | null = null
    try {
      tx = await addTransaction({
        accountId: rec.accountId,
        date,
        type,
        payment_method: paymentMethod,
        amount_cents: rec.amount_cents,
        description: rec.description || rec.name,
        paid,
        installment: null,
        recurrentId: rec.id,
      })

      if (paid) {
        const deltas = collectAppliedAccountDeltas({ ...tx, paid: true })
        await applyDeltasWithCompensation(
          deltas,
          () => rec.name,
        )
      }

      return tx
    } catch (error: any) {
      let rollbackApplied = false
      if (tx) {
        try {
          await apiDelete(`/transactions/${tx.id}`)
          transactions.value = transactions.value.filter(item => item.id !== tx!.id)
          rollbackApplied = true
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: tx ? 'adjust_balance' : 'create_transaction',
        message: error?.message || 'Falha ao pagar recorrente.',
        rollbackApplied,
      })
    }
  }

  async function addTransaction(tx: Omit<Transaction, 'id'>) {
    validateTransactionBusinessRules(tx)
    ensureCreditAccountConfigured(tx.accountId, tx.payment_method)
    const paid = tx.paid !== undefined ? tx.paid : derivePaid(tx.type, tx.payment_method)
    const created = await apiPost<Transaction>('/transactions', {
      ...tx,
      id: uuid(),
      paid,
      createdAt: nowISO(),
    })
    transactions.value.push(created)
    return created
  }

  /**
   * Gera N parcelas a partir dos dados base.
   * Retorna array das transactions criadas.
   */
  async function generateInstallments(base: {
    accountId: number
    date: string
    type: Transaction['type']
    payment_method?: 'debit' | 'credit'
    totalAmountCents: number
    installmentAmountCents: number
    description?: string
    product: string
    totalInstallments: number
  }) {
    if (!Number.isInteger(base.totalInstallments) || base.totalInstallments < 2 || base.totalInstallments > 72) {
      throw new Error('Numero de parcelas deve estar entre 2 e 72.')
    }
    if (!Number.isFinite(base.totalAmountCents) || !Number.isFinite(base.installmentAmountCents)) {
      throw new Error('Valores de parcelamento invalidos.')
    }
    if (base.totalAmountCents === 0 || base.installmentAmountCents === 0) {
      throw new Error('Total e valor da parcela devem ser maiores que zero.')
    }
    if (Math.sign(base.totalAmountCents) !== Math.sign(base.installmentAmountCents)) {
      throw new Error('Total e valor da parcela devem ter o mesmo sinal.')
    }

    const regularWithoutLast = base.installmentAmountCents * (base.totalInstallments - 1)
    const lastInstallmentAmount = base.totalAmountCents - regularWithoutLast
    if (lastInstallmentAmount === 0 || Math.sign(lastInstallmentAmount) !== Math.sign(base.totalAmountCents)) {
      throw new Error('Combinacao de total, quantidade e valor da parcela invalida.')
    }

    ensureCreditAccountConfigured(base.accountId, base.payment_method)
    const parentId = uuid()
    const created: Transaction[] = []
    const isCredit = base.payment_method === 'credit'

    const regularInstallmentsTotal = base.installmentAmountCents * base.totalInstallments
    const roundingDiffCents = base.totalAmountCents - regularInstallmentsTotal

    for (let i = 1; i <= base.totalInstallments; i++) {
      const installmentDate = i === 1 ? base.date : addMonths(base.date, i - 1)
      // Crédito: todas as parcelas pendentes (acumula na fatura)
      // Débito: só 1ª parcela paga, demais pendentes
      const isPaid = isCredit ? false : (i === 1)
      // Absorve diferença de arredondamento na última parcela para fechar o total.
      const installmentAmountCents = i === base.totalInstallments
        ? base.installmentAmountCents + roundingDiffCents
        : base.installmentAmountCents

      const tx = await apiPost<Transaction>('/transactions', {
        id: uuid(),
        accountId: base.accountId,
        date: installmentDate,
        type: base.type,
        payment_method: base.payment_method,
        amount_cents: installmentAmountCents,
        description: base.description,
        paid: isPaid,
        installment: {
          parentId,
          total: base.totalInstallments,
          index: i,
          product: base.product,
        },
        createdAt: nowISO(),
      })
      created.push(tx)
      transactions.value.push(tx)
    }

    // Ajustar saldo somente se débito (1ª parcela paga imediatamente)
    if (!isCredit && created[0]) {
      const accountsStore = useAccountsStore()
      await accountsStore.adjustBalance(
        base.accountId,
        base.installmentAmountCents,
        `Parcela 1/${base.totalInstallments} - ${base.product}`,
      )
    }

    return created
  }

  async function markPaid(txId: string) {
    const tx = transactions.value.find(t => t.id === txId)
    if (!tx || tx.paid || paymentInFlight.value.has(txId)) return

    paymentInFlight.value.add(txId)
    const previousPaid = tx.paid

    try {
      await apiPatch(`/transactions/${txId}`, { paid: true })
      tx.paid = true

      const deltas = collectAppliedAccountDeltas({ ...tx, paid: true })
      await applyDeltasWithCompensation(deltas, () =>
        tx.installment
          ? `Parcela ${tx.installment.index}/${tx.installment.total} - ${tx.installment.product}`
          : tx.description || 'Transacao',
      )
    } catch (error: any) {
      let rollbackApplied = false
      try {
        await apiPatch(`/transactions/${txId}`, { paid: previousPaid })
        tx.paid = previousPaid
        rollbackApplied = true
      } catch {
        rollbackApplied = false
      }

      throw createAtomicOperationError({
        stage: 'mark_paid',
        message: error?.message || 'Falha ao marcar transacao como paga.',
        rollbackApplied,
      })
    } finally {
      paymentInFlight.value.delete(txId)
    }
  }

  async function markUnpaid(txId: string) {
    const tx = transactions.value.find(t => t.id === txId)
    if (!tx || !tx.paid || paymentInFlight.value.has(txId)) return

    paymentInFlight.value.add(txId)
    const previousPaid = tx.paid

    try {
      await apiPatch(`/transactions/${txId}`, { paid: false })
      tx.paid = false

      const appliedDeltas = collectAppliedAccountDeltas({ ...tx, paid: true })
      const reversalDeltas = new Map<number, number>()
      for (const [accountId, delta] of appliedDeltas) {
        addAccountDelta(reversalDeltas, accountId, -delta)
      }

      await applyDeltasWithCompensation(reversalDeltas, () =>
        tx.installment
          ? `Estorno parcela ${tx.installment.index}/${tx.installment.total} - ${tx.installment.product}`
          : `Estorno - ${tx.description || 'Transacao'}`,
      )
    } catch (error: any) {
      let rollbackApplied = false
      try {
        await apiPatch(`/transactions/${txId}`, { paid: previousPaid })
        tx.paid = previousPaid
        rollbackApplied = true
      } catch {
        rollbackApplied = false
      }

      throw createAtomicOperationError({
        stage: 'mark_unpaid',
        message: error?.message || 'Falha ao desfazer pagamento da transacao.',
        rollbackApplied,
      })
    } finally {
      paymentInFlight.value.delete(txId)
    }
  }

  function addAccountDelta(map: Map<number, number>, accountId: number | undefined, delta: number) {
    if (accountId == null) return
    if (!Number.isFinite(delta) || delta === 0) return
    map.set(accountId, (map.get(accountId) ?? 0) + delta)
  }

  function collectAppliedAccountDeltas(tx: Transaction) {
    const deltas = new Map<number, number>()
    if (!tx.paid) return deltas

    // Impacto principal na conta da transacao.
    addAccountDelta(deltas, tx.accountId, tx.amount_cents)

    // Transferencia tambem impacta a conta destino com sinal inverso.
    if (tx.type === 'transfer') {
      addAccountDelta(deltas, tx.destinationAccountId, -tx.amount_cents)
    }

    return deltas
  }

  function snapshotTransaction(tx: Transaction): Transaction {
    return {
      ...tx,
      installment: tx.installment ? { ...tx.installment } : tx.installment,
    }
  }

  async function updateTransaction(id: string, patch: Partial<Transaction>) {
    let old = transactions.value.find(t => t.id === id)
    if (!old) {
      old = await apiGet<Transaction>(`/transactions/${id}`)
    }

    const candidate: Transaction = { ...old, ...patch }
    validateTransactionBusinessRules(candidate)

    const oldSnapshot = old ? snapshotTransaction(old) : null
    const nextAccountId = patch.accountId ?? old?.accountId
    const nextPaymentMethod = patch.payment_method ?? old?.payment_method
    if (nextAccountId != null) {
      ensureCreditAccountConfigured(nextAccountId, nextPaymentMethod)
    }

    const updated = await apiPatch<Transaction>(`/transactions/${id}`, patch)
    const idx = transactions.value.findIndex(t => t.id === id)
    if (idx !== -1) transactions.value[idx] = updated

    // Sem snapshot anterior em memoria, nao ha como calcular diferenca de saldo com seguranca.
    if (!oldSnapshot) return updated

    const accountsStore = useAccountsStore()

    // Reverte o impacto antigo e aplica o impacto novo por conta.
    const oldDeltas = collectAppliedAccountDeltas(oldSnapshot)
    const newDeltas = collectAppliedAccountDeltas(updated)
    const netDeltas = new Map<number, number>()

    for (const [accountId, delta] of oldDeltas) {
      addAccountDelta(netDeltas, accountId, -delta)
    }
    for (const [accountId, delta] of newDeltas) {
      addAccountDelta(netDeltas, accountId, delta)
    }

    const label = updated.description
      || oldSnapshot.description
      || (updated.type === 'transfer' || oldSnapshot.type === 'transfer' ? 'Transferencia' : 'Transacao')

    for (const [accountId, delta] of netDeltas) {
      if (delta === 0) continue
      await accountsStore.adjustBalance(accountId, delta, `Ajuste edicao - ${label}`)
    }

    return updated
  }

  function isPaidCreditTransaction(tx: Transaction) {
    return tx.payment_method === 'credit' && tx.paid
  }

  function hasPaidCreditInInstallmentGroup(parentId: string) {
    return transactions.value.some(t =>
      t.installment?.parentId === parentId && isPaidCreditTransaction(t),
    )
  }

  async function applyDeltasWithCompensation(
    deltas: Map<number, number>,
    noteFactory: (accountId: number, delta: number) => string,
  ) {
    const accountsStore = useAccountsStore()
    const applied: Array<{ accountId: number, delta: number, note: string }> = []

    try {
      for (const [accountId, delta] of deltas) {
        if (!delta) continue
        const note = noteFactory(accountId, delta)
        await accountsStore.adjustBalance(accountId, delta, note)
        applied.push({ accountId, delta, note })
      }
      return { rollbackApplied: true as const }
    } catch (error) {
      let rollbackApplied = true
      for (const item of [...applied].reverse()) {
        try {
          await accountsStore.adjustBalance(
            item.accountId,
            -item.delta,
            `Rollback - ${item.note}`,
          )
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: 'adjust_balance',
        message: error instanceof Error ? error.message : 'Falha ao ajustar saldo.',
        rollbackApplied,
      })
    }
  }

  function getInstallmentGroupTotalCents(parentId: string): number {
    return transactions.value
      .filter(tx => tx.installment?.parentId === parentId)
      .reduce((sum, tx) => sum + tx.amount_cents, 0)
  }

  async function deleteTransaction(id: string) {
    const tx = transactions.value.find(t => t.id === id)
    if (tx && isPaidCreditTransaction(tx)) {
      throw new Error('Transacoes de credito pagas nao podem ser excluidas.')
    }

    const txSnapshot = tx ? snapshotTransaction(tx) : null

    await apiDelete(`/transactions/${id}`)
    transactions.value = transactions.value.filter(t => t.id !== id)

    if (!txSnapshot) return

    const accountsStore = useAccountsStore()
    const appliedDeltas = collectAppliedAccountDeltas(txSnapshot)
    const label = txSnapshot.description || (txSnapshot.type === 'transfer' ? 'Transferencia' : 'Transacao')

    for (const [accountId, delta] of appliedDeltas) {
      if (delta === 0) continue
      await accountsStore.adjustBalance(accountId, -delta, `Estorno exclusao - ${label}`)
    }
  }

  /** Exclui todas as parcelas de um grupo (mesmo parentId) */
  async function deleteInstallmentGroup(parentId: string, onProgress?: (current: number, total: number) => void) {
    if (hasPaidCreditInInstallmentGroup(parentId)) {
      throw new Error('O grupo possui parcela de credito ja paga e nao pode ser excluido.')
    }

    const parcelas = transactions.value.filter(t => t.installment?.parentId === parentId)
    const parcelasSnapshots = parcelas.map(snapshotTransaction)

    const deletionResults = await Promise.allSettled(
      parcelas.map(async (parcela, index) => {
        await apiDelete(`/transactions/${parcela.id}`)
        onProgress?.(index + 1, parcelas.length)
      }),
    )

    const failedDeletes = deletionResults.filter(result => result.status === 'rejected')
    if (failedDeletes.length > 0) {
      const successfulIndexes = deletionResults
        .map((result, index) => ({ result, index }))
        .filter(item => item.result.status === 'fulfilled')
        .map(item => item.index)

      let rollbackApplied = true
      await Promise.all(successfulIndexes.map(async (index) => {
        try {
          await apiPost('/transactions', parcelasSnapshots[index])
        } catch {
          rollbackApplied = false
        }
      }))

      throw createAtomicOperationError({
        stage: 'delete_installments',
        message: 'Falha ao excluir todas as parcelas do grupo.',
        rollbackApplied,
      })
    }

    transactions.value = transactions.value.filter(t => t.installment?.parentId !== parentId)

    if (!parcelasSnapshots.length) return

    const reversalDeltas = new Map<number, number>()
    for (const parcela of parcelasSnapshots) {
      const applied = collectAppliedAccountDeltas(parcela)
      for (const [accountId, delta] of applied) {
        addAccountDelta(reversalDeltas, accountId, -delta)
      }
    }

    const groupLabel = parcelasSnapshots[0]?.installment?.product || 'Parcelas'
    try {
      await applyDeltasWithCompensation(
        reversalDeltas,
        () => `Estorno exclusao grupo - ${groupLabel}`,
      )
    } catch (error: any) {
      let rollbackApplied = true
      await Promise.all(parcelasSnapshots.map(async (snapshot) => {
        try {
          await apiPost('/transactions', snapshot)
        } catch {
          rollbackApplied = false
        }
      }))

      if (rollbackApplied) {
        transactions.value.push(...parcelasSnapshots)
      }

      throw createAtomicOperationError({
        stage: 'reverse_group_balance',
        message: error?.message || 'Falha ao recompor saldo na exclusao do grupo de parcelas.',
        rollbackApplied,
      })
    }
  }

  return {
    transactions,
    loadTransactions,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    deleteInstallmentGroup,
    isPaidCreditTransaction,
    hasPaidCreditInInstallmentGroup,
    getInstallmentGroupTotalCents,
    generateInstallments,
    markPaid,
    markUnpaid,
    unpaidForMonth,
    hasRecurrentTransaction,
    payRecurrent,
    derivePaid,
    creditInvoicesByAccount,
  }
})
