<script setup lang="ts">
import { Save } from 'lucide-vue-next'
import type { Transaction, Recurrent } from '~/schemas/zod-schemas'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useAppToast } from '~/composables/useAppToast'
import { hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { createAtomicOperationError } from '~/utils/atomic-error'
import { parseBRLToCents, formatCentsToBRL } from '~/utils/money'
import { nowISO } from '~/utils/dates'

const props = defineProps<{
  editTransaction?: Transaction | null
  editRecurrent?: Recurrent | null
  defaultType?: 'transacao' | 'recorrente' | 'investimento'
}>()

const emit = defineEmits<{ saved: [] }>()

const accountsStore = useAccountsStore()
const transactionsStore = useTransactionsStore()
const recurrentsStore = useRecurrentsStore()
const positionsStore = useInvestmentPositionsStore()
const eventsStore = useInvestmentEventsStore()
const appToast = useAppToast()

const isEdit = computed(() => !!props.editTransaction || !!props.editRecurrent)
const isEditingPaidTransaction = computed(() => !!props.editTransaction?.paid)

const tipoMovimentacao = ref<'transacao' | 'recorrente' | 'investimento'>('transacao')
const loading = ref(false)
const isHydratingEditTransaction = ref(false)
const isApplyingInstallmentComputation = ref(false)
const installmentAutoAdjustedField = ref<'amount' | 'totalParcelas' | 'valorParcela' | null>(null)
const installmentIntegrityMessage = ref('')

function centsToBRLDisplay(cents: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(cents) / 100)
}

function formatQuantityDisplay(quantity: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(quantity)
}

function parseOptionalRecurringDay(value: string, fieldLabel: string): number | undefined {
  if (!value) return undefined
  const day = Number(value)
  if (!Number.isInteger(day) || day < 1 || day > 31) {
    throw new Error(`${fieldLabel} deve ser um dia entre 1 e 31`)
  }
  return day
}

function formatInstallmentFieldLabel(field: 'amount' | 'totalParcelas' | 'valorParcela' | null): string {
  if (field === 'amount') return 'Total'
  if (field === 'totalParcelas') return 'Quantidade de parcelas'
  if (field === 'valorParcela') return 'Valor da parcela'
  return ''
}

function parsePositiveCents(value: string): number | null {
  if (!value) return null
  const cents = parseBRLToCents(value)
  if (!Number.isFinite(cents) || cents <= 0) return null
  return cents
}

function parseInstallmentCount(value: string): number | null {
  if (!value) return null
  const total = Number(value)
  if (!Number.isInteger(total) || total < 2 || total > 72) return null
  return total
}

// ── Form Transação ──
const txForm = reactive({
  type: 'expense' as 'expense' | 'income' | 'transfer',
  payment_method: 'credit' as 'debit' | 'credit',
  accountId: null as number | null,
  destinationAccountId: null as number | null,
  paid: false,
  amount: '',
  date: nowISO(),
  description: '',
  parcelado: false,
  totalParcelas: '',
  produto: '',
  valorParcela: '',
})

// ── Form Recorrente ──
const recForm = reactive({
  accountId: null as number | null,
  kind: 'expense' as 'income' | 'expense',
  payment_method: 'debit' as 'debit' | 'credit',
  notify: false,
  name: '',
  amount: '',
  frequency: 'monthly' as const,
  day_of_month: '',
  due_day: '',
  description: '',
  active: true,
})
const showRecNotify = computed(() =>
  recForm.kind === 'expense' && recForm.payment_method === 'debit'
)

// ── Form Investimento (lançamento) ──
const invForm = reactive({
  positionId: '',
  date: nowISO(),
  event_type: 'buy' as 'buy' | 'sell' | 'income' | 'contribution' | 'withdrawal' | 'maturity',
  quantity: '',
  unit_price: '',
  amount: '',
  note: '',
})

const selectedPosition = computed(() =>
  positionsStore.positions.find(p => p.id === invForm.positionId),
)

const eventTypeOptionsVariable = [
  { label: 'Compra', value: 'buy' },
  { label: 'Venda', value: 'sell' },
  { label: 'Rendimento', value: 'income' },
] as const

const eventTypeOptionsFixed = [
  { label: 'Aporte', value: 'contribution' },
  { label: 'Resgate', value: 'withdrawal' },
  { label: 'Rendimento', value: 'income' },
  { label: 'Vencimento', value: 'maturity' },
] as const

const eventTypeOptions = computed(() =>
  {
    const position = selectedPosition.value
    if (position?.bucket === 'fixed') {
      if (position.investment_type === 'caixinha') {
        return eventTypeOptionsFixed.filter(opt => opt.value !== 'maturity')
      }
      return eventTypeOptionsFixed
    }
    return eventTypeOptionsVariable
  },
)

const investmentPositions = computed(() => {
  return positionsStore.positions
})

const accountsWithCreditCard = computed(() =>
  accountsStore.accounts.filter(account => hasCompleteCreditCardConfig(account)),
)

const transactionAccounts = computed(() => {
  if (txForm.type !== 'expense' || txForm.payment_method !== 'credit') {
    return accountsStore.accounts
  }
  return accountsWithCreditCard.value
})

const recurrentAccounts = computed(() => {
  if (recForm.kind !== 'expense' || recForm.payment_method !== 'credit') {
    return accountsStore.accounts
  }
  return accountsWithCreditCard.value
})

// Contas para transferência/débito seguem todas as contas.
const availableAccounts = computed(() => accountsStore.accounts)

// ── Transfer helpers ──
const canTransfer = computed(() => accountsStore.accounts.length >= 2)

const originAccountBalance = computed(() => {
  if (!txForm.accountId) return null
  const acc = accountsStore.accounts.find(a => a.id === txForm.accountId)
  return acc ? acc.balance_cents : null
})

const destinationAccounts = computed(() =>
  accountsStore.accounts.filter(a => a.id !== txForm.accountId),
)

const showPaidStatusCheckbox = computed(() =>
  txForm.type === 'expense'
  && txForm.payment_method === 'credit',
)

const showInstallmentSection = computed(() =>
  !isEdit.value
  && txForm.type === 'expense'
  && txForm.payment_method === 'credit',
)

const installmentAutoAdjustedLabel = computed(() =>
  formatInstallmentFieldLabel(installmentAutoAdjustedField.value),
)

function setInstallmentField(
  field: 'amount' | 'totalParcelas' | 'valorParcela',
  value: string,
): boolean {
  if (txForm[field] === value) return false
  txForm[field] = value
  return true
}

function withInstallmentComputation(action: () => void) {
  isApplyingInstallmentComputation.value = true
  try {
    action()
  } finally {
    isApplyingInstallmentComputation.value = false
  }
}

function recomputeInstallmentTriad(source: 'amount' | 'totalParcelas' | 'valorParcela') {
  if (!showInstallmentSection.value || !txForm.parcelado) return

  installmentIntegrityMessage.value = ''
  const totalCents = parsePositiveCents(txForm.amount)
  const installmentCount = parseInstallmentCount(txForm.totalParcelas)
  const installmentCents = parsePositiveCents(txForm.valorParcela)

  const applyAmount = (valueCents: number) => {
    if (setInstallmentField('amount', centsToBRLDisplay(valueCents))) {
      installmentAutoAdjustedField.value = 'amount'
    }
  }
  const applyInstallmentValue = (valueCents: number) => {
    if (setInstallmentField('valorParcela', centsToBRLDisplay(valueCents))) {
      installmentAutoAdjustedField.value = 'valorParcela'
    }
  }
  const applyInstallmentCount = (value: number) => {
    if (setInstallmentField('totalParcelas', String(value))) {
      installmentAutoAdjustedField.value = 'totalParcelas'
    }
  }

  withInstallmentComputation(() => {
    if (source === 'amount') {
      if (installmentCount !== null && totalCents !== null) {
        applyInstallmentValue(Math.round(totalCents / installmentCount))
        return
      }
      if (installmentCents !== null && totalCents !== null) {
        if (totalCents % installmentCents !== 0) {
          installmentIntegrityMessage.value = 'Total e valor da parcela devem resultar em quantidade inteira.'
          return
        }
        const computedCount = totalCents / installmentCents
        if (!Number.isInteger(computedCount) || computedCount < 2 || computedCount > 72) {
          installmentIntegrityMessage.value = 'Quantidade de parcelas deve ficar entre 2 e 72.'
          return
        }
        applyInstallmentCount(computedCount)
      }
      return
    }

    if (source === 'totalParcelas') {
      if (installmentCount !== null && totalCents !== null) {
        applyInstallmentValue(Math.round(totalCents / installmentCount))
        return
      }
      if (installmentCount !== null && installmentCents !== null) {
        applyAmount(installmentCents * installmentCount)
      }
      return
    }

    if (installmentCount !== null && installmentCents !== null) {
      applyAmount(installmentCents * installmentCount)
      return
    }
    if (totalCents !== null && installmentCents !== null) {
      if (totalCents % installmentCents !== 0) {
        installmentIntegrityMessage.value = 'Total e valor da parcela devem resultar em quantidade inteira.'
        return
      }
      const computedCount = totalCents / installmentCents
      if (!Number.isInteger(computedCount) || computedCount < 2 || computedCount > 72) {
        installmentIntegrityMessage.value = 'Quantidade de parcelas deve ficar entre 2 e 72.'
        return
      }
      applyInstallmentCount(computedCount)
    }
  })
}

function validateInstallmentIntegrity(totalCents: number, installmentCents: number, totalInstallments: number) {
  if (totalCents <= 0) throw new Error('Valor total deve ser maior que R$ 0,00')
  if (installmentCents <= 0) throw new Error('Valor da parcela deve ser maior que R$ 0,00')
  if (!Number.isInteger(totalInstallments)) throw new Error('Numero de parcelas deve ser inteiro')
  if (totalInstallments < 2) throw new Error('Mínimo 2 parcelas')
  if (totalInstallments > 72) throw new Error('Máximo de 72 parcelas')

  const lastInstallmentCents = totalCents - (installmentCents * (totalInstallments - 1))
  if (lastInstallmentCents <= 0) {
    throw new Error('Combinacao invalida: revise Total, Quantidade e Valor da Parcela.')
  }
}

watch(() => invForm.positionId, () => {
  const position = selectedPosition.value
  if (!position) return

  // Só ajusta event_type se o tipo atual não for compatível com o novo bucket
  const validTypes = position.bucket === 'fixed'
    ? ['contribution', 'withdrawal', 'income', 'maturity']
    : ['buy', 'sell', 'income']

  if (!validTypes.includes(invForm.event_type)) {
    invForm.event_type = position.bucket === 'fixed' ? 'contribution' : 'buy'
  }
})

watch(() => [invForm.quantity, invForm.unit_price], () => {
  if (!selectedPosition.value || selectedPosition.value.bucket !== 'variable') return
  if (!invForm.quantity || !invForm.unit_price) return

  const qty = Number(invForm.quantity.replace(',', '.'))
  if (!Number.isFinite(qty) || qty <= 0) return
  const cents = parseBRLToCents(invForm.unit_price)
  invForm.amount = formatCentsToBRL(Math.round(qty * cents))
})

// Resetar campos ao trocar tipo
watch(() => txForm.type, () => {
  if (isHydratingEditTransaction.value) return

  if (txForm.type === 'income') {
    txForm.payment_method = 'credit'
    txForm.parcelado = false
    txForm.totalParcelas = ''
    txForm.produto = ''
    txForm.valorParcela = ''
  }
  if (txForm.type === 'expense') {
    txForm.payment_method = 'credit'
  }
  if (txForm.type === 'transfer') {
    txForm.payment_method = 'debit'
    txForm.parcelado = false
    txForm.totalParcelas = ''
    txForm.produto = ''
    txForm.valorParcela = ''
    txForm.destinationAccountId = null
  }
})

watch(() => recForm.kind, (kind) => {
  if (kind !== 'expense') {
    recForm.payment_method = 'debit'
    recForm.due_day = ''
    return
  }

  recForm.day_of_month = ''
})

watch(() => recForm.payment_method, (method) => {
  if (method === 'credit') {
    recForm.due_day = ''
  }
})

watch(() => [recForm.kind, recForm.payment_method], () => {
  if (!showRecNotify.value) {
    recForm.notify = false
  }
  if (recForm.kind !== 'expense' || recForm.payment_method !== 'credit') return
  const account = accountsStore.accounts.find(a => a.id === recForm.accountId)
  if (account && !hasCompleteCreditCardConfig(account)) {
    recForm.accountId = null
  }
})

// Resetar conta ao trocar método (pode ter ficado conta sem cartão)
watch(() => txForm.payment_method, (method) => {
  if (method !== 'credit') {
    txForm.parcelado = false
    txForm.totalParcelas = ''
    txForm.produto = ''
    txForm.valorParcela = ''
    return
  }

  if (method === 'credit') {
    const account = accountsStore.accounts.find(a => a.id === txForm.accountId)
    if (account && !hasCompleteCreditCardConfig(account)) {
      txForm.accountId = null
    }
  }
})

// Auto-calcular valor da parcela quando valor total ou nº de parcelas mudar
watch(() => txForm.amount, (next, prev) => {
  if (isApplyingInstallmentComputation.value || next === prev) return
  recomputeInstallmentTriad('amount')
})

watch(() => txForm.totalParcelas, (next, prev) => {
  if (isApplyingInstallmentComputation.value || next === prev) return
  recomputeInstallmentTriad('totalParcelas')
})

watch(() => txForm.valorParcela, (next, prev) => {
  if (isApplyingInstallmentComputation.value || next === prev) return
  recomputeInstallmentTriad('valorParcela')
})

watch(() => txForm.parcelado, (enabled) => {
  if (enabled) return
  installmentAutoAdjustedField.value = null
  installmentIntegrityMessage.value = ''
})

// Preencher forms quando editando
watch(() => props.editTransaction, (tx) => {
  if (tx) {
    isHydratingEditTransaction.value = true
    tipoMovimentacao.value = 'transacao'
    txForm.type = tx.type
    txForm.payment_method = tx.payment_method ?? 'credit'
    txForm.accountId = tx.accountId
    txForm.destinationAccountId = tx.destinationAccountId ?? null
    txForm.paid = tx.paid
    txForm.amount = centsToBRLDisplay(tx.amount_cents)
    txForm.date = tx.date
    txForm.description = tx.description ?? ''
    txForm.parcelado = false
    txForm.totalParcelas = ''
    txForm.produto = ''
    txForm.valorParcela = ''
    nextTick(() => {
      isHydratingEditTransaction.value = false
    })
    return
  }

  isHydratingEditTransaction.value = false
}, { immediate: true })

watch(() => props.editRecurrent, (rec) => {
  if (rec) {
    tipoMovimentacao.value = 'recorrente'
    recForm.accountId = rec.accountId
    recForm.kind = rec.kind
    recForm.payment_method = rec.payment_method ?? 'debit'
    recForm.notify = rec.notify ?? false
    recForm.name = rec.name
    recForm.amount = centsToBRLDisplay(rec.amount_cents)
    recForm.day_of_month = rec.day_of_month?.toString() ?? ''
    recForm.due_day = rec.due_day?.toString() ?? ''
    recForm.description = rec.description ?? ''
    recForm.active = rec.active
  }
}, { immediate: true })

watch(() => props.defaultType, (type) => {
  if (!type || isEdit.value) return
  tipoMovimentacao.value = type
}, { immediate: true })

function resetForms() {
  Object.assign(txForm, {
    type: 'expense', payment_method: 'credit', accountId: null, destinationAccountId: null,
    paid: false,
    amount: '', date: nowISO(),
    description: '', parcelado: false, totalParcelas: '', produto: '', valorParcela: '',
  })
  Object.assign(recForm, {
    accountId: null, kind: 'expense', payment_method: 'debit', name: '', amount: '', frequency: 'monthly',
    notify: false, day_of_month: '', due_day: '', description: '', active: true,
  })
  Object.assign(invForm, {
    positionId: '',
    date: nowISO(),
    event_type: 'buy',
    quantity: '',
    unit_price: '',
    amount: '',
    note: '',
  })
  installmentAutoAdjustedField.value = null
  installmentIntegrityMessage.value = ''
}

async function handleSubmit() {
  if (loading.value) return
  loading.value = true

  try {
    if (tipoMovimentacao.value === 'transacao') {
      await submitTransacao()
      appToast.success({
        title: isEdit.value ? 'Transação atualizada' : (txForm.parcelado ? 'Parcelas geradas' : 'Transação salva'),
      })
    } else if (tipoMovimentacao.value === 'recorrente') {
      await submitRecorrente()
      appToast.success({
        title: isEdit.value ? 'Recorrente atualizada' : 'Recorrente criada',
      })
    } else {
      await submitInvestimento()
      appToast.success({ title: 'Lançamento registrado' })
    }
    resetForms()
    emit('saved')
  } catch (e: any) {
    const description = e?.message || 'Ocorreu um erro ao salvar os dados.'
    const title = tipoMovimentacao.value === 'investimento'
      ? 'Erro ao registrar lançamento'
      : tipoMovimentacao.value === 'recorrente'
        ? 'Erro ao salvar recorrente'
        : 'Erro ao salvar transação'

    appToast.error({ title, description })
  } finally {
    loading.value = false
  }
}

async function submitTransacao() {
  if (!txForm.accountId) throw new Error('Selecione uma conta')
  if (!txForm.amount) throw new Error('Informe o valor')
  if (!txForm.date) throw new Error('Informe a data')

  const cents = parseBRLToCents(txForm.amount)
  if (cents <= 0) throw new Error('Valor deve ser maior que R$ 0,00')

  // Transferencia
  if (txForm.type === 'transfer') {
    const transferAccountId = isEditingPaidTransaction.value
      ? props.editTransaction!.accountId
      : txForm.accountId
    const transferDestinationAccountId = isEditingPaidTransaction.value
      ? props.editTransaction?.destinationAccountId ?? null
      : txForm.destinationAccountId
    const transferAmountCents = isEditingPaidTransaction.value
      ? props.editTransaction!.amount_cents
      : -cents

    if (!transferDestinationAccountId) throw new Error('Selecione a conta destino')
    if (transferAccountId === transferDestinationAccountId) throw new Error('Conta origem e destino devem ser diferentes')
    if (!canTransfer.value) throw new Error('Cadastre pelo menos 2 contas para transferir')

    if (!props.editTransaction || !isEditingPaidTransaction.value) {
      const originBalance = originAccountBalance.value ?? 0
      if (originBalance < cents) throw new Error('Saldo insuficiente na conta de origem')
    }

    if (props.editTransaction) {
      await transactionsStore.updateTransaction(props.editTransaction.id, {
        accountId: transferAccountId,
        destinationAccountId: transferDestinationAccountId,
        date: txForm.date,
        type: 'transfer',
        payment_method: undefined,
        amount_cents: transferAmountCents,
        description: txForm.description || 'Transferencia entre contas',
        paid: isEditingPaidTransaction.value ? props.editTransaction.paid : true,
      })
      return
    }

    const label = txForm.description || 'Transferencia entre contas'
    let createdTransfer: Transaction | null = null
    let originAdjusted = false
    try {
      createdTransfer = await transactionsStore.addTransaction({
        accountId: transferAccountId,
        destinationAccountId: transferDestinationAccountId,
        date: txForm.date,
        type: 'transfer',
        payment_method: undefined,
        amount_cents: transferAmountCents,
        description: label,
        paid: true,
        installment: null,
      })

      await accountsStore.adjustBalance(transferAccountId, transferAmountCents, `Saida transferencia - ${label}`)
      originAdjusted = true
      await accountsStore.adjustBalance(transferDestinationAccountId, -transferAmountCents, `Entrada transferencia - ${label}`)
    } catch (error: any) {
      let rollbackApplied = true

      if (originAdjusted) {
        try {
          await accountsStore.adjustBalance(transferAccountId, -transferAmountCents, `Rollback saida transferencia - ${label}`)
        } catch {
          rollbackApplied = false
        }
      }

      if (createdTransfer) {
        try {
          await transactionsStore.deleteTransaction(createdTransfer.id)
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: 'create_transfer',
        message: error?.message || 'Falha ao criar transferencia.',
        rollbackApplied,
      })
    }
    return
  }

  // Despesa / Receita
  const amount_cents = isEditingPaidTransaction.value
    ? props.editTransaction!.amount_cents
    : txForm.type === 'expense' ? -cents : cents
  const payment_method = txForm.type === 'income' ? undefined : txForm.payment_method

  if (payment_method === 'credit') {
    const account = accountsStore.accounts.find(a => a.id === txForm.accountId)
    if (!hasCompleteCreditCardConfig(account)) {
      throw new Error('Selecione uma conta com cartao configurado (fechamento e vencimento).')
    }
  }

  if (props.editTransaction) {
    const defaultPaid = transactionsStore.derivePaid(txForm.type, payment_method)
    const paid = isEditingPaidTransaction.value
      ? props.editTransaction.paid
      : (txForm.paid || defaultPaid)
    await transactionsStore.updateTransaction(props.editTransaction.id, {
      accountId: txForm.accountId,
      date: txForm.date,
      type: txForm.type,
      payment_method,
      amount_cents,
      description: txForm.description || undefined,
      paid,
    })
    return
  }

  if (txForm.parcelado && txForm.payment_method === 'credit') {
    const total = Number(txForm.totalParcelas)
    if (!Number.isInteger(total)) throw new Error('Numero de parcelas deve ser inteiro')
    if (total < 2) throw new Error('Minimo 2 parcelas')
    if (total > 72) throw new Error('Maximo de 72 parcelas')
    if (!txForm.produto) throw new Error('Informe o produto')
    if (!txForm.valorParcela) throw new Error('Informe o valor da parcela')

    const parcelaCents = parseBRLToCents(txForm.valorParcela)
    if (parcelaCents <= 0) throw new Error('Valor da parcela deve ser maior que R$ 0,00')
    validateInstallmentIntegrity(cents, parcelaCents, total)
    const installmentAmountCents = txForm.type === 'expense' ? -parcelaCents : parcelaCents

    await transactionsStore.generateInstallments({
      accountId: txForm.accountId,
      date: txForm.date,
      type: txForm.type,
      payment_method,
      totalAmountCents: amount_cents,
      installmentAmountCents,
      description: txForm.description || undefined,
      product: txForm.produto,
      totalInstallments: total,
    })
    return
  }

  const paid = txForm.paid || transactionsStore.derivePaid(txForm.type, payment_method)
  let createdTx: Transaction | null = null
  try {
    createdTx = await transactionsStore.addTransaction({
      accountId: txForm.accountId,
      date: txForm.date,
      type: txForm.type,
      payment_method,
      amount_cents,
      description: txForm.description || undefined,
      paid,
      installment: null,
    })

    if (createdTx.paid) {
      await accountsStore.adjustBalance(
        txForm.accountId,
        amount_cents,
        txForm.description || 'Transacao',
      )
    }
  } catch (error: any) {
    let rollbackApplied = false
    if (createdTx) {
      try {
        await transactionsStore.deleteTransaction(createdTx.id)
        rollbackApplied = true
      } catch {
        rollbackApplied = false
      }
    }

    throw createAtomicOperationError({
      stage: createdTx ? 'adjust_balance' : 'create_transaction',
      message: error?.message || 'Falha ao salvar transacao.',
      rollbackApplied,
    })
  }
}
async function submitRecorrente() {
  if (!recForm.name) throw new Error('Informe o nome')
  if (!recForm.amount) throw new Error('Informe o valor')

  if (accountsStore.accounts.length === 0) throw new Error('Cadastre uma conta primeiro')
  if (!recForm.accountId) throw new Error('Selecione uma conta')

  if (recForm.kind === 'expense' && recForm.payment_method === 'credit') {
    const account = accountsStore.accounts.find(a => a.id === recForm.accountId)
    if (!hasCompleteCreditCardConfig(account)) {
      throw new Error('Selecione uma conta com cartão configurado')
    }
  }

  const accountId = recForm.accountId
  const cents = parseBRLToCents(recForm.amount)
  const amount_cents = recForm.kind === 'expense' ? -cents : cents
  const payment_method = recForm.kind === 'expense' ? recForm.payment_method : undefined
  const due_day =
    recForm.kind === 'expense' && recForm.payment_method === 'debit'
      ? parseOptionalRecurringDay(recForm.due_day, 'Vencimento')
      : undefined
  const day_of_month =
    recForm.kind === 'income'
      ? parseOptionalRecurringDay(recForm.day_of_month, 'Recebimento')
      : undefined

  if (props.editRecurrent) {
    await recurrentsStore.updateRecurrent(props.editRecurrent.id, {
      accountId,
      kind: recForm.kind,
      payment_method,
      notify: showRecNotify.value ? recForm.notify : false,
      name: recForm.name,
      amount_cents,
      frequency: recForm.frequency,
      day_of_month,
      due_day,
      description: recForm.description || undefined,
      active: recForm.active,
    })
  } else {
    await recurrentsStore.addRecurrent({
      accountId,
      kind: recForm.kind,
      payment_method,
      notify: showRecNotify.value ? recForm.notify : false,
      name: recForm.name,
      amount_cents,
      frequency: recForm.frequency,
      day_of_month,
      due_day,
      description: recForm.description || undefined,
      active: recForm.active,
    })
  }
}

async function submitInvestimento() {
  if (!invForm.positionId) throw new Error('Selecione uma posição')
  if (!invForm.date) throw new Error('Informe a data')
  if (!invForm.amount) throw new Error('Informe o valor total')
  const amountCents = parseBRLToCents(invForm.amount)
  if (amountCents <= 0) throw new Error('Valor deve ser maior que R$ 0,00')

  const position = selectedPosition.value
  if (!position) throw new Error('Ativo inválido')

  if (position.investment_type === 'caixinha' && invForm.event_type === 'maturity') {
    throw new Error('Evento vencimento não está disponível para caixinha')
  }

  if (position.bucket === 'variable' && (invForm.event_type === 'buy' || invForm.event_type === 'sell')) {
    const qty = Number(invForm.quantity.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Informe a quantidade')
    if (invForm.event_type === 'sell') {
      const availableQty = position.quantity_total ?? 0
      if (qty > availableQty) {
        throw new Error(`Voce possui apenas ${formatQuantityDisplay(availableQty)} cotas`)
      }
    }
  }

  await eventsStore.addEvent({
    positionId: position.id,
    accountId: position.accountId,
    date: invForm.date,
    event_type: invForm.event_type,
    amount_cents: amountCents,
    quantity: invForm.quantity ? Number(invForm.quantity.replace(',', '.')) : undefined,
    unit_price_cents: invForm.unit_price ? parseBRLToCents(invForm.unit_price) : undefined,
    note: invForm.note || undefined,
  })
}

const txTypeOptions = [
  { label: 'Despesa', value: 'expense' },
  { label: 'Receita', value: 'income' },
  { label: 'Transferência', value: 'transfer' },
]

const methodOptions = [
  { label: 'Débito', value: 'debit' },
  { label: 'Crédito', value: 'credit' },
]

const kindOptions = [
  { label: 'Despesa', value: 'expense' },
  { label: 'Receita', value: 'income' },
]

const recPaymentMethodOptions = [
  { label: 'Boleto (avista)', value: 'debit' },
  { label: 'Cartao/Conta (fatura)', value: 'credit' },
]
</script>

<template>
  <Tabs v-model="tipoMovimentacao" class="space-y-4">
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <TabsList class="w-full" v-if="!isEdit">
        <TabsTrigger value="transacao" class="flex-1" :disabled="loading">Transação</TabsTrigger>
        <TabsTrigger value="recorrente" class="flex-1" :disabled="loading">Recorrente</TabsTrigger>
        <TabsTrigger value="investimento" class="flex-1" :disabled="loading">Investimento</TabsTrigger>
      </TabsList>

      <div :class="loading ? 'pointer-events-none opacity-70 transition-opacity' : 'transition-opacity'">
      <template v-if="tipoMovimentacao === 'transacao'">
        <!-- Tipo (sempre visível) -->
        <div class="space-y-2">
          <Label>Tipo *</Label>
          <Select v-model="txForm.type">
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="opt in txTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- ── Layout Transferência ── -->
        <template v-if="txForm.type === 'transfer'">
          <div v-if="!canTransfer" class="text-sm text-destructive">
            Cadastre pelo menos 2 contas para realizar transferências.
          </div>

          <div v-else class="grid grid-cols-2 gap-4">
            <!-- Conta Origem -->
            <div class="space-y-2">
              <Label>Conta Origem *</Label>
              <Select v-model="txForm.accountId" :disabled="isEditingPaidTransaction" data-testid="transfer-origin-select">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="acc in availableAccounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
                </SelectContent>
              </Select>
              <p v-if="originAccountBalance !== null" class="text-xs text-muted-foreground">
                Saldo: {{ formatCentsToBRL(originAccountBalance) }}
              </p>
            </div>

            <!-- Conta Destino -->
            <div class="space-y-2">
              <Label>Conta Destino *</Label>
              <Select v-model="txForm.destinationAccountId" :disabled="isEditingPaidTransaction" data-testid="transfer-destination-select">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="acc in destinationAccounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label>Valor *</Label>
              <MoneyInput v-model="txForm.amount" :disabled="isEditingPaidTransaction" data-testid="transfer-amount-input" />
              <p v-if="isEditingPaidTransaction" class="text-xs text-muted-foreground">
                Valor bloqueado para transação já paga.
              </p>
            </div>

            <p v-if="isEditingPaidTransaction" class="col-span-2 text-xs text-muted-foreground">
              Conta origem e destino ficam bloqueadas para transferência já paga.
            </p>

            <div class="space-y-2">
              <Label>Data *</Label>
              <Input v-model="txForm.date" type="date" />
            </div>

            <div class="col-span-2 space-y-2">
              <Label>Descrição</Label>
              <Input v-model="txForm.description" placeholder="Opcional" />
            </div>

          </div>
        </template>

        <!-- ── Layout Despesa / Receita ── -->
        <template v-else>
          <div class="grid grid-cols-2 gap-4">
            <!-- Método (condicional) -->
            <div v-if="txForm.type !== 'income'" class="space-y-2">
              <Label>Método *</Label>
              <Select v-model="txForm.payment_method">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in methodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- Conta -->
            <div class="space-y-2">
              <Label>Conta *</Label>
              <Select v-model="txForm.accountId">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="acc in transactionAccounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div class="space-y-2">
              <Label>Valor *</Label>
              <MoneyInput v-model="txForm.amount" :disabled="isEditingPaidTransaction" />
              <p v-if="isEditingPaidTransaction" class="text-xs text-muted-foreground">
                Valor bloqueado para transação já paga.
              </p>
            </div>

            <div class="space-y-2">
              <Label>Data *</Label>
              <Input v-model="txForm.date" type="date" />
            </div>

            <div class="col-span-2 space-y-2">
              <Label>Descrição</Label>
              <Input v-model="txForm.description" placeholder="Opcional" />
            </div>

            <div v-if="showPaidStatusCheckbox" class="col-span-2 flex items-center gap-2 pt-1">
              <Checkbox v-model="txForm.paid" :disabled="loading || isEditingPaidTransaction" />
              <Label>
                {{ isEditingPaidTransaction ? 'Pago (desfazer via ação específica)' : 'Marcar como pago' }}
              </Label>
            </div>
          </div>

          <div v-if="showInstallmentSection" class="space-y-3 mt-3">
            <div class="flex items-center gap-2">
              <Checkbox v-model="txForm.parcelado" />
              <Label>Parcelado</Label>
            </div>

            <div v-if="txForm.parcelado" class="grid grid-cols-3 gap-4 pl-6">
              <div class="space-y-2">
                <Label>Total de Parcelas *</Label>
                <Input v-model="txForm.totalParcelas" placeholder="Ex: 10" type="number" min="2" max="72" step="1" />
              </div>
              <div class="space-y-2">
                <Label>Valor da Parcela *</Label>
                <MoneyInput v-model="txForm.valorParcela" />
              </div>
              <div class="space-y-2">
                <Label>Produto *</Label>
                <Input v-model="txForm.produto" placeholder="Ex: Geladeira" />
              </div>
            </div>
            <p v-if="txForm.parcelado && installmentAutoAdjustedLabel" class="text-xs text-muted-foreground pl-6">
              Campo autoajustado: {{ installmentAutoAdjustedLabel }}
            </p>
            <p v-if="txForm.parcelado && installmentIntegrityMessage" class="text-xs text-destructive pl-6">
              {{ installmentIntegrityMessage }}
            </p>
          </div>
        </template>
      </template>

      <template v-if="tipoMovimentacao === 'recorrente'">
        <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Tipo *</Label>
            <Select v-model="recForm.kind">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in kindOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="recForm.kind === 'expense'" class="space-y-2">
            <Label>Cobranca *</Label>
            <Select v-model="recForm.payment_method">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in recPaymentMethodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Conta *</Label>
              <Select v-model="recForm.accountId">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="acc in recurrentAccounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

          <div class="space-y-2">
            <Label>Nome *</Label>
            <Input v-model="recForm.name" placeholder="Ex: Academia" />
          </div>

          <div class="space-y-2">
            <Label>Valor *</Label>
            <MoneyInput v-model="recForm.amount" />
          </div>


          <div
            v-if="recForm.kind === 'expense' && recForm.payment_method === 'debit'"
            class="space-y-2"
          >
            <Label>Vencimento (dia)</Label>
            <Input v-model="recForm.due_day" placeholder="1-31" type="number" min="1" max="31" step="1" />
          </div>

          <div
            v-if="recForm.kind === 'income'"
            class="space-y-2"
          >
            <Label>Recebimento (dia)</Label>
            <Input v-model="recForm.day_of_month" placeholder="1-31" type="number" min="1" max="31" step="1" />
          </div>

          <div class="col-span-2 space-y-2">
            <Label>Descrição</Label>
            <Input v-model="recForm.description" placeholder="Opcional" />
          </div>
        </div>

        <div class="flex items-center gap-6 mt-4">
          <div v-if="showRecNotify" class="flex items-center gap-2">
            <Checkbox v-model="recForm.notify" />
            <Label>Notificar</Label>
          </div>
          
          <div class="flex items-center gap-2">
            <Checkbox v-model="recForm.active" />
            <Label>Ativo</Label>
          </div>
        </div>
      </template>

      <template v-if="tipoMovimentacao === 'investimento'">
        <div class="grid grid-cols-2 gap-4">
          <div class="col-span-2 space-y-2">
            <Label>Ativo *</Label>
            <Select v-model="invForm.positionId">
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in investmentPositions" :key="p.id" :value="p.id">
                  {{ p.name ? `${p.asset_code} · ${p.name}` : p.asset_code }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Data *</Label>
            <Input v-model="invForm.date" type="date" />
          </div>

          <div class="space-y-2">
            <Label>Evento *</Label>
            <Select v-model="invForm.event_type">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in eventTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="selectedPosition?.bucket === 'variable' && (invForm.event_type === 'buy' || invForm.event_type === 'sell')">
            <div class="space-y-2">
              <Label>Quantidade *</Label>
              <Input v-model="invForm.quantity" placeholder="Ex: 10" />
              <p
                v-if="invForm.event_type === 'sell'"
                class="text-xs text-muted-foreground"
              >
                Disponivel: {{ formatQuantityDisplay(selectedPosition.quantity_total ?? 0) }} cotas
              </p>
            </div>
            <div class="space-y-2">
              <Label>Preço Unitário</Label>
              <MoneyInput v-model="invForm.unit_price" />
            </div>
          </template>

          <div class="space-y-2">
            <Label>Valor Total *</Label>
            <MoneyInput v-model="invForm.amount" />
          </div>

          <div class="col-span-2 space-y-2">
            <Label>Observação</Label>
            <Input v-model="invForm.note" placeholder="Opcional" />
          </div>
        </div>
      </template>
      </div>

      <Button type="submit" :disabled="loading || (txForm.type === 'transfer' && !canTransfer)" class="w-full">
        <Spinner v-if="loading" class="h-4 w-4 mr-2" />
        <Save v-else class="h-4 w-4 mr-2" />
        {{ loading ? 'Salvando...' : (isEdit ? 'Atualizar' : 'Salvar') }}
      </Button>
    </form>
  </Tabs>
</template>


