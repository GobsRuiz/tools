import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Account, Transaction } from '~/schemas/zod-schemas'
import { assertValidCreditCardPair } from '~/utils/account-credit'
import { createAtomicOperationError } from '~/utils/atomic-error'
import { apiAtomic, apiDelete, apiGet, apiPost, apiPatch } from '~/utils/api'
import { useTransactionsStore } from './useTransactions'
import { useRecurrentsStore } from './useRecurrents'
import { useInvestmentPositionsStore } from './useInvestmentPositions'
import { useInvestmentEventsStore } from './useInvestmentEvents'

export const useAccountsStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([])

  type CascadeAuditEntry = {
    stage: string
    count?: number
    message?: string
  }

  type DeleteAccountSummary = {
    transactionsDeleted: number
    recurrentsDeleted: number
    investmentPositionsDeleted: number
    investmentEventsDeleted: number
    auditTrail?: CascadeAuditEntry[]
  }

  type CascadeSnapshot = {
    accounts: Array<Record<string, any>>
    transactions: Array<Record<string, any>>
    recurrents: Array<Record<string, any>>
    investment_positions: Array<Record<string, any>>
    investment_events: Array<Record<string, any>>
  }

  function canUseAtomicIpc() {
    return typeof window !== 'undefined' && !!window.electronAPI?.atomic
  }

  function addAccountDelta(map: Map<number, number>, targetAccountId: number | undefined, delta: number) {
    if (targetAccountId == null) return
    if (!Number.isFinite(delta) || delta === 0) return
    map.set(targetAccountId, (map.get(targetAccountId) ?? 0) + delta)
  }

  async function loadAccounts() {
    accounts.value = await apiGet<Account[]>('/accounts')
  }

  async function addAccount(data: Omit<Account, 'id'>) {
    assertValidCreditCardPair(data)
    const created = await apiPost<Account>('/accounts', data)
    accounts.value.push(created)
    return created
  }

  async function updateAccount(id: number, patch: Partial<Account>) {
    const current = accounts.value.find(account => account.id === id)
    assertValidCreditCardPair({
      card_closing_day: patch.card_closing_day ?? current?.card_closing_day,
      card_due_day: patch.card_due_day ?? current?.card_due_day,
    })

    const updated = await apiPatch<Account>(`/accounts/${id}`, patch)
    const idx = accounts.value.findIndex(a => a.id === id)
    if (idx !== -1) accounts.value[idx] = updated
    return updated
  }

  async function adjustBalance(accountId: number, deltaCents: number, _note?: string) {
    const account = accounts.value.find(a => a.id === accountId)
    if (!account) throw new Error(`Conta ${accountId} não encontrada`)

    const newBalance = account.balance_cents + deltaCents
    await apiPatch(`/accounts/${accountId}`, { balance_cents: newBalance })
    account.balance_cents = newBalance
  }

  async function reloadAllStoresAfterCascade() {
    await Promise.all([
      loadAccounts(),
      useTransactionsStore().loadTransactions(),
      useRecurrentsStore().loadRecurrents(),
      useInvestmentPositionsStore().loadPositions(),
      useInvestmentEventsStore().loadEvents(),
    ])
  }

  async function captureCascadeSnapshot(): Promise<CascadeSnapshot> {
    const [
      snapshotAccounts,
      snapshotTransactions,
      snapshotRecurrents,
      snapshotPositions,
      snapshotEvents,
    ] = await Promise.all([
      apiGet<Array<Record<string, any>>>('/accounts'),
      apiGet<Array<Record<string, any>>>('/transactions'),
      apiGet<Array<Record<string, any>>>('/recurrents'),
      apiGet<Array<Record<string, any>>>('/investment_positions'),
      apiGet<Array<Record<string, any>>>('/investment_events'),
    ])

    return {
      accounts: snapshotAccounts,
      transactions: snapshotTransactions,
      recurrents: snapshotRecurrents,
      investment_positions: snapshotPositions,
      investment_events: snapshotEvents,
    }
  }

  async function restoreCascadeSnapshot(snapshot: CascadeSnapshot) {
    const deleteOrder = [
      'transactions',
      'recurrents',
      'investment_events',
      'investment_positions',
      'accounts',
    ] as const

    for (const collection of deleteOrder) {
      const current = await apiGet<Array<Record<string, any>>>(`/${collection}`)
      await Promise.all(current.map(item => apiDelete(`/${collection}/${item.id}`)))
    }

    const insertOrder = [
      'accounts',
      'transactions',
      'recurrents',
      'investment_positions',
      'investment_events',
    ] as const

    for (const collection of insertOrder) {
      await Promise.all(snapshot[collection].map(item => apiPost(`/${collection}`, item)))
    }
  }

  async function deleteAccount(accountId: number, onProgress?: (step: string) => void) {
    const auditTrail: CascadeAuditEntry[] = []

    if (canUseAtomicIpc()) {
      const atomicStart = 'Executando exclusao atomica...'
      auditTrail.push({ stage: 'atomic_start', message: atomicStart })
      onProgress?.(atomicStart)
      try {
        const deleted = await apiAtomic<DeleteAccountSummary>('deleteAccountCascade', { accountId })

        await reloadAllStoresAfterCascade()

        const doneMessage = 'Concluido!'
        auditTrail.push({ stage: 'atomic_done', message: doneMessage })
        onProgress?.(doneMessage)
        return {
          ...deleted,
          auditTrail: [...(deleted.auditTrail ?? []), ...auditTrail],
        }
      } catch (error: any) {
        const message = error?.message || 'Falha na exclusao atomica da conta.'
        auditTrail.push({ stage: 'atomic_failed', message })
        throw createAtomicOperationError({
          stage: 'delete_account_cascade',
          message,
          rollbackApplied: false,
        })
      }
    }

    const snapshot = await captureCascadeSnapshot()

    try {
      type CascadingTransaction = Pick<Transaction, 'id' | 'accountId' | 'destinationAccountId' | 'type' | 'amount_cents' | 'paid'>

      auditTrail.push({ stage: 'collect_linked_data' })
      const [txFromAccount, txToAccount, recurrents, investmentPositions, eventsByAccount] = await Promise.all([
        apiGet<CascadingTransaction[]>('/transactions', { accountId: String(accountId) }),
        apiGet<CascadingTransaction[]>('/transactions', { destinationAccountId: String(accountId) }),
        apiGet<Array<{ id: string, accountId: number }>>('/recurrents', { accountId: String(accountId) }),
        apiGet<Array<{ id: string, accountId: number }>>('/investment_positions', { accountId: String(accountId) }),
        apiGet<Array<{ id: string, accountId: number }>>('/investment_events', { accountId: String(accountId) }),
      ])

      const txMap = new Map<string, CascadingTransaction>()
      for (const tx of txFromAccount) txMap.set(tx.id, tx)
      for (const tx of txToAccount) txMap.set(tx.id, tx)

      // Reverte o impacto de transacoes pagas removidas na cascata para manter saldos consistentes.
      const reversalDeltas = new Map<number, number>()
      for (const tx of txMap.values()) {
        if (!tx.paid) continue

        addAccountDelta(reversalDeltas, tx.accountId, -tx.amount_cents)
        if (tx.type === 'transfer') {
          addAccountDelta(reversalDeltas, tx.destinationAccountId, tx.amount_cents)
        }
      }

      // Conta excluida nao recebe recomposicao.
      reversalDeltas.delete(accountId)

      const eventsByPosition = await Promise.all(
        investmentPositions.map(position =>
          apiGet<Array<{ id: string, positionId: string }>>('/investment_events', { positionId: position.id }),
        ),
      )

      const eventMap = new Map<string, { id: string }>()
      for (const event of eventsByAccount) eventMap.set(event.id, event)
      for (const events of eventsByPosition) {
        for (const event of events) {
          eventMap.set(event.id, event)
        }
      }

      const removeEventsMessage = 'Excluindo eventos de investimento...'
      onProgress?.(removeEventsMessage)
      auditTrail.push({ stage: 'delete_investment_events', count: eventMap.size, message: removeEventsMessage })
      await Promise.all(
        [...eventMap.values()].map(event => apiDelete(`/investment_events/${event.id}`)),
      )

      const removePositionsMessage = 'Excluindo posicoes...'
      onProgress?.(removePositionsMessage)
      auditTrail.push({ stage: 'delete_investment_positions', count: investmentPositions.length, message: removePositionsMessage })
      await Promise.all(
        investmentPositions.map(position => apiDelete(`/investment_positions/${position.id}`)),
      )

      if (reversalDeltas.size > 0) {
        const recomputeMessage = 'Recompondo saldos...'
        onProgress?.(recomputeMessage)
        auditTrail.push({ stage: 'recompose_balances', count: reversalDeltas.size, message: recomputeMessage })
        for (const [affectedAccountId, delta] of reversalDeltas) {
          if (delta === 0) continue
          if (!accounts.value.some(account => account.id === affectedAccountId)) continue
          await adjustBalance(affectedAccountId, delta, 'Estorno exclusao em cascata - conta removida')
        }
      }

      const removeTransactionsMessage = 'Excluindo transacoes...'
      onProgress?.(removeTransactionsMessage)
      auditTrail.push({ stage: 'delete_transactions', count: txMap.size, message: removeTransactionsMessage })
      await Promise.all(
        [...txMap.values()].map(tx => apiDelete(`/transactions/${tx.id}`)),
      )

      const removeRecurrentsMessage = 'Excluindo recorrentes...'
      onProgress?.(removeRecurrentsMessage)
      auditTrail.push({ stage: 'delete_recurrents', count: recurrents.length, message: removeRecurrentsMessage })
      await Promise.all(
        recurrents.map(rec => apiDelete(`/recurrents/${rec.id}`)),
      )

      const removeAccountMessage = 'Removendo conta...'
      onProgress?.(removeAccountMessage)
      auditTrail.push({ stage: 'delete_account', count: 1, message: removeAccountMessage })
      await apiDelete(`/accounts/${accountId}`)

      await reloadAllStoresAfterCascade()

      const doneMessage = 'Concluido!'
      onProgress?.(doneMessage)
      auditTrail.push({ stage: 'done', message: doneMessage })

      return {
        transactionsDeleted: txMap.size,
        recurrentsDeleted: recurrents.length,
        investmentPositionsDeleted: investmentPositions.length,
        investmentEventsDeleted: eventMap.size,
        auditTrail,
      } satisfies DeleteAccountSummary
    } catch (error: any) {
      const failureMessage = error?.message || 'Falha ao excluir conta em cascata.'
      auditTrail.push({ stage: 'failed', message: failureMessage })

      let rollbackApplied = false
      try {
        await restoreCascadeSnapshot(snapshot)
        await reloadAllStoresAfterCascade()
        rollbackApplied = true
      } catch {
        rollbackApplied = false
      }

      throw createAtomicOperationError({
        stage: 'delete_account_cascade',
        message: failureMessage,
        rollbackApplied,
      })
    }
  }

  return { accounts, loadAccounts, addAccount, updateAccount, adjustBalance, deleteAccount }
})
