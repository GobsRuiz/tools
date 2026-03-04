import dayjs from 'dayjs'
import type { Transaction, Recurrent, InvestmentEvent } from '~~/schemas/zod-schemas'
import { useTransactionsStore } from '~/stores/useTransactions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useAccountsStore } from '~/stores/useAccounts'
import { usePagination } from '~/composables/usePagination'
import { parseBRLToCents, formatCentsToBRL } from '~/utils/money'
import { monthKey, nowISO } from '~/utils/dates'
import { getErrorMessage } from '~/utils/error'
import {
  formatCentsToPtBrInput,
  formatQuantityPtBr,
  getEffectiveAvailableQuantityForSell,
  investmentEventTypeOptionsFixed,
  investmentEventTypeOptionsVariable,
} from '~/utils/investment-events'
import { useAppToast } from '~/composables/useAppToast'

export type MovimentacoesTab = 'transacoes' | 'recorrentes' | 'investimentos'

type EmitFn = {
  (event: 'edit-transaction', tx: Transaction): void
  (event: 'edit-recurrent', rec: Recurrent): void
  (event: 'tab-change', tab: MovimentacoesTab): void
}

export function useMovimentacoesState(
  props: { initialTab?: MovimentacoesTab },
  emit: EmitFn,
) {
  const transactionsStore = useTransactionsStore()
  const recurrentsStore = useRecurrentsStore()
  const investmentPositionsStore = useInvestmentPositionsStore()
  const investmentEventsStore = useInvestmentEventsStore()
  const accountsStore = useAccountsStore()
  const appToast = useAppToast()

  // ── Filter open state ──

  const txFiltersOpen = ref(false)
  const recFiltersOpen = ref(false)
  const invFiltersOpen = ref(false)
  const activeTab = ref<MovimentacoesTab>(props.initialTab ?? 'transacoes')

  // ── Transaction filters ──

  const txDefaultMonth = monthKey(nowISO())
  const txFilterConta = ref<number | null>(null)
  const txFilterMes = ref(txDefaultMonth)
  const txFilterStatus = ref<'todos' | 'pago' | 'pendente'>('todos')

  // ── Recurrent filters ──

  const recFilterConta = ref<number | null>(null)
  const recFilterStatus = ref<'todos' | 'ativo' | 'inativo'>('todos')

  // ── Investment filters ──

  const invFilterConta = ref<number | null>(null)
  const investmentEventDialogOpen = ref(false)
  const editingInvestmentEvent = ref<InvestmentEvent | null>(null)
  const savingInvestmentEvent = ref(false)
  const investmentEventForm = reactive({
    positionId: '',
    date: nowISO(),
    event_type: 'buy' as InvestmentEvent['event_type'],
    quantity: '',
    unit_price: '',
    amount: '',
    note: '',
  })

  // ── Expand state for installments ──

  const expandedParents = ref<Set<string>>(new Set())

  // ── View state ──

  const viewingTransaction = ref<Transaction | null>(null)
  const transactionViewDialogOpen = ref(false)
  const processingAction = ref<'delete' | 'mark-unpaid' | null>(null)
  const isProcessing = computed(() => processingAction.value !== null || savingInvestmentEvent.value)
  const deleteInstallmentProgress = ref(0)
  const deleteInstallmentTotal = ref(0)
  const showDeleteInstallmentModal = ref(false)

  const deleteInstallmentPercent = computed(() => {
    if (!deleteInstallmentTotal.value) return 0
    return Math.round((deleteInstallmentProgress.value / deleteInstallmentTotal.value) * 100)
  })

  const deleteInstallmentCurrentStep = computed(() => {
    if (!deleteInstallmentTotal.value) return 0
    if (deleteInstallmentProgress.value >= deleteInstallmentTotal.value) return deleteInstallmentTotal.value
    return deleteInstallmentProgress.value + 1
  })

  const deleteInstallmentCurrentLabel = computed(() => {
    if (!deleteInstallmentTotal.value) return 'Excluindo parcelas...'
    return `Excluindo parcela ${deleteInstallmentCurrentStep.value} de ${deleteInstallmentTotal.value}...`
  })

  const deleteInstallmentStepMeta = computed(() => {
    if (!deleteInstallmentTotal.value) return ''
    return `Etapa ${deleteInstallmentCurrentStep.value} de ${deleteInstallmentTotal.value}`
  })

  const viewingRecurrent = ref<Recurrent | null>(null)
  const recurrentViewDialogOpen = ref(false)

  // ── Confirm delete ──

  const confirmDeleteOpen = ref(false)
  const deleteTarget = ref<{
    type: 'transaction' | 'installment-group' | 'recurrent' | 'investment-event'
    id: string
    label: string
  } | null>(null)

  // ── Computed ──

  const selectedInvestmentPosition = computed(() =>
    investmentPositionsStore.positions.find(pos => pos.id === investmentEventForm.positionId),
  )

  const availableSellQuantity = computed(() => {
    const position = selectedInvestmentPosition.value
    if (!position || position.bucket !== 'variable') return 0
    return getEffectiveAvailableQuantityForSell(position, editingInvestmentEvent.value)
  })

  const investmentEventTypeOptions = computed(() => {
    const position = selectedInvestmentPosition.value
    if (position?.bucket === 'fixed') {
      if (position.investment_type === 'caixinha') {
        return investmentEventTypeOptionsFixed.filter(opt => opt.value !== 'maturity')
      }
      return investmentEventTypeOptionsFixed
    }
    return investmentEventTypeOptionsVariable
  })

  // ── Filtered lists ──

  const filteredTransactions = computed(() => {
    let txs = transactionsStore.transactions

    if (txFilterConta.value) {
      txs = txs.filter(t => t.accountId === txFilterConta.value)
    }
    if (txFilterMes.value) {
      txs = txs.filter(t => monthKey(t.date) === txFilterMes.value)
    }
    if (txFilterStatus.value === 'pago') {
      txs = txs.filter(t => t.paid)
    } else if (txFilterStatus.value === 'pendente') {
      txs = txs.filter(t => !t.paid)
    }

    txs = [...txs].sort((a, b) => (b.createdAt ?? b.date).localeCompare(a.createdAt ?? a.date))

    const seen = new Set<string>()
    return txs.filter(t => {
      if (t.installment?.parentId) {
        if (seen.has(t.installment.parentId)) return false
        seen.add(t.installment.parentId)
      }
      return true
    })
  })

  const filteredRecurrents = computed(() => {
    let recs = recurrentsStore.recurrents
    if (recFilterConta.value) {
      recs = recs.filter(r => r.accountId === recFilterConta.value)
    }
    if (recFilterStatus.value === 'ativo') {
      recs = recs.filter(r => r.active)
    } else if (recFilterStatus.value === 'inativo') {
      recs = recs.filter(r => !r.active)
    }
    return recs
  })

  const filteredInvestments = computed(() => {
    let invs = investmentEventsStore.events
    if (invFilterConta.value) {
      invs = invs.filter(i => i.accountId === invFilterConta.value)
    }
    return [...invs].sort((a, b) => b.date.localeCompare(a.date))
  })

  const pageSizeOptions = [10, 20, 40, 70, 100] as const

  // ── Pagination ──

  const {
    pageSize: txPageSize,
    page: txPage,
    goToPage: txGoToPage,
    totalItems: txTotalItems,
    totalPages: txTotalPages,
    pageStart: txPageStart,
    pageEnd: txPageEnd,
    paginatedItems: paginatedTransactions,
    setPage: baseSetTxPage,
    submitGoToPage: baseSubmitTxGoToPage,
  } = usePagination(filteredTransactions, 40)

  const {
    pageSize: recPageSize,
    page: recPage,
    goToPage: recGoToPage,
    totalItems: recTotalItems,
    totalPages: recTotalPages,
    pageStart: recPageStart,
    pageEnd: recPageEnd,
    paginatedItems: paginatedRecurrents,
    setPage: baseSetRecPage,
    submitGoToPage: baseSubmitRecGoToPage,
  } = usePagination(filteredRecurrents, 40)

  const {
    pageSize: invPageSize,
    page: invPage,
    goToPage: invGoToPage,
    totalItems: invTotalItems,
    totalPages: invTotalPages,
    pageStart: invPageStart,
    pageEnd: invPageEnd,
    paginatedItems: paginatedInvestments,
    setPage: baseSetInvPage,
    submitGoToPage: baseSubmitInvGoToPage,
  } = usePagination(filteredInvestments, 40)

  // ── Static options ──

  const txStatusOptions = [
    { label: 'Todos', value: 'todos' },
    { label: 'Pago', value: 'pago' },
    { label: 'Pendente', value: 'pendente' },
  ]

  const recStatusOptions = [
    { label: 'Todos', value: 'todos' },
    { label: 'Ativo', value: 'ativo' },
    { label: 'Inativo', value: 'inativo' },
  ]

  // ── Filter status ──

  const hasTxFilters = computed(() =>
    txFilterConta.value !== null || txFilterMes.value !== txDefaultMonth || txFilterStatus.value !== 'todos',
  )
  const hasRecFilters = computed(() =>
    recFilterConta.value !== null || recFilterStatus.value !== 'todos',
  )
  const hasInvFilters = computed(() =>
    invFilterConta.value !== null,
  )

  // ── Aliases ──

  const formatCentsToInput = formatCentsToPtBrInput
  const formatQuantityDisplay = formatQuantityPtBr

  // ── Watches ──

  watch(() => props.initialTab, (tab) => {
    if (tab && tab !== activeTab.value) {
      activeTab.value = tab
    }
  })

  watch(activeTab, (tab) => {
    emit('tab-change', tab)
  }, { immediate: true })

  watch([txFilterConta, txFilterMes, txFilterStatus], () => {
    txPage.value = 1
    txGoToPage.value = ''
  })

  watch([recFilterConta, recFilterStatus], () => {
    recPage.value = 1
    recGoToPage.value = ''
  })

  watch(invFilterConta, () => {
    invPage.value = 1
    invGoToPage.value = ''
  })

  watch(() => investmentEventForm.positionId, () => {
    const position = selectedInvestmentPosition.value
    if (!position) return

    const validTypes = position.bucket === 'fixed'
      ? ['contribution', 'withdrawal', 'income', 'maturity']
      : ['buy', 'sell', 'income']

    if (!validTypes.includes(investmentEventForm.event_type)) {
      investmentEventForm.event_type = position.bucket === 'fixed' ? 'contribution' : 'buy'
    }
  })

  watch(() => [investmentEventForm.quantity, investmentEventForm.unit_price], () => {
    if (!selectedInvestmentPosition.value || selectedInvestmentPosition.value.bucket !== 'variable') return
    if (!investmentEventForm.quantity || !investmentEventForm.unit_price) return

    const qty = Number(investmentEventForm.quantity.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) return

    const cents = parseBRLToCents(investmentEventForm.unit_price)
    investmentEventForm.amount = formatCentsToBRL(Math.round(qty * cents))
  })

  watch(investmentEventDialogOpen, (open) => {
    if (!open) {
      editingInvestmentEvent.value = null
      resetInvestmentEventForm()
    }
  })

  // ── Helper functions ──

  function getAccountLabel(accountId: number) {
    return accountsStore.accounts.find(a => a.id === accountId)?.label ?? '—'
  }

  function getTransactionDisplayAmountCents(tx: Transaction) {
    if (!tx.installment?.parentId) return tx.amount_cents
    return transactionsStore.getInstallmentGroupTotalCents(tx.installment.parentId)
  }

  function getPositionLabel(positionId: string) {
    const p = investmentPositionsStore.positions.find(pos => pos.id === positionId)
    if (!p) return '—'
    return p.name?.trim() ? `${p.asset_code} · ${p.name}` : p.asset_code
  }

  function getPositionBucketLabel(positionId: string) {
    const p = investmentPositionsStore.positions.find(pos => pos.id === positionId)
    if (!p) return '—'
    return p.bucket === 'variable' ? 'Renda Variável' : 'Renda Fixa'
  }

  function formatDisplayDate(date: string) {
    return dayjs(date).isValid()
      ? dayjs(date).format('DD/MM/YYYY')
      : date
  }

  // ── Actions ──

  function toggleExpand(parentId: string) {
    if (isProcessing.value) return
    if (expandedParents.value.has(parentId)) {
      expandedParents.value.delete(parentId)
    } else {
      expandedParents.value.add(parentId)
    }
  }

  function openViewTransaction(tx: Transaction) {
    if (isProcessing.value) return
    viewingTransaction.value = tx
    transactionViewDialogOpen.value = true
  }

  function openViewRecurrent(rec: Recurrent) {
    if (isProcessing.value) return
    viewingRecurrent.value = rec
    recurrentViewDialogOpen.value = true
  }

  function requestDelete(
    type: 'transaction' | 'installment-group' | 'recurrent' | 'investment-event',
    id: string,
    label: string,
  ) {
    if (isProcessing.value) return
    deleteTarget.value = { type, id, label }
    confirmDeleteOpen.value = true
  }

  function requestDeleteTransaction(tx: Transaction) {
    if (isProcessing.value) return
    if (tx.installment?.parentId) {
      if (transactionsStore.hasPaidCreditInInstallmentGroup(tx.installment.parentId)) {
        appToast.warning({
          title: 'Exclusão bloqueada',
          description: 'Não é possível excluir grupo com parcela de crédito já paga.',
        })
        return
      }

      requestDelete('installment-group', tx.installment.parentId, `${tx.installment.product} ${tx.installment.total}x`)
      return
    }

    if (transactionsStore.isPaidCreditTransaction(tx)) {
      appToast.warning({
        title: 'Exclusão bloqueada',
        description: 'Transações de crédito já pagas não podem ser excluídas.',
      })
      return
    }

    requestDelete('transaction', tx.id, tx.description || 'Transacao')
  }

  function editTransaction(tx: Transaction) {
    if (isProcessing.value) return
    emit('edit-transaction', tx)
  }

  function canMarkUnpaidTransaction(tx: Transaction) {
    return tx.paid && !tx.installment && tx.type !== 'transfer'
  }

  async function markTransactionUnpaid(tx: Transaction) {
    if (isProcessing.value || !canMarkUnpaidTransaction(tx)) return
    processingAction.value = 'mark-unpaid'

    try {
      await transactionsStore.markUnpaid(tx.id)
      appToast.success({
        title: 'Pagamento desfeito',
        description: `${tx.description || 'Transacao'} marcada como pendente.`,
      })
    } catch (e: unknown) {
      appToast.error({
        title: 'Erro ao desfazer pagamento',
        description: getErrorMessage(e, 'Nao foi possivel desfazer o pagamento.'),
      })
    } finally {
      processingAction.value = null
    }
  }

  function editRecurrent(rec: Recurrent) {
    if (isProcessing.value) return
    emit('edit-recurrent', rec)
  }

  function openEditInvestmentEvent(event: InvestmentEvent) {
    if (isProcessing.value) return
    editingInvestmentEvent.value = event
    investmentEventForm.positionId = event.positionId
    investmentEventForm.date = event.date
    investmentEventForm.event_type = event.event_type
    investmentEventForm.quantity = event.quantity != null ? String(event.quantity).replace('.', ',') : ''
    investmentEventForm.unit_price = formatCentsToInput(event.unit_price_cents)
    investmentEventForm.amount = formatCentsToInput(event.amount_cents)
    investmentEventForm.note = event.note ?? ''
    investmentEventDialogOpen.value = true
  }

  function onInvestmentEventDialogOpenChange(open: boolean) {
    if (!open && savingInvestmentEvent.value) return
    investmentEventDialogOpen.value = open
  }

  function cancelDelete() {
    if (isProcessing.value) return
    confirmDeleteOpen.value = false
    deleteTarget.value = null
  }

  function openDeleteInstallmentModal(total: number) {
    deleteInstallmentTotal.value = total
    deleteInstallmentProgress.value = 0
    showDeleteInstallmentModal.value = true
  }

  function closeDeleteInstallmentModal() {
    showDeleteInstallmentModal.value = false
    deleteInstallmentProgress.value = 0
    deleteInstallmentTotal.value = 0
  }

  function clearTxFilters() {
    if (isProcessing.value) return
    txFilterConta.value = null
    txFilterMes.value = txDefaultMonth
    txFilterStatus.value = 'todos'
  }

  function clearRecFilters() {
    if (isProcessing.value) return
    recFilterConta.value = null
    recFilterStatus.value = 'todos'
  }

  function clearInvFilters() {
    if (isProcessing.value) return
    invFilterConta.value = null
  }

  function setTxPage(page: number) {
    if (isProcessing.value) return
    baseSetTxPage(page)
  }

  function setRecPage(page: number) {
    if (isProcessing.value) return
    baseSetRecPage(page)
  }

  function setInvPage(page: number) {
    if (isProcessing.value) return
    baseSetInvPage(page)
  }

  function submitTxGoToPage() {
    if (isProcessing.value) return
    baseSubmitTxGoToPage()
  }

  function submitRecGoToPage() {
    if (isProcessing.value) return
    baseSubmitRecGoToPage()
  }

  function submitInvGoToPage() {
    if (isProcessing.value) return
    baseSubmitInvGoToPage()
  }

  async function confirmDelete() {
    if (!deleteTarget.value || isProcessing.value) return
    processingAction.value = 'delete'

    try {
      const { type, id } = deleteTarget.value
      if (type === 'transaction') {
        await transactionsStore.deleteTransaction(id)
      } else if (type === 'installment-group') {
        const total = transactionsStore.transactions.filter(tx => tx.installment?.parentId === id).length
        openDeleteInstallmentModal(total)
        await transactionsStore.deleteInstallmentGroup(id, (current, totalItems) => {
          deleteInstallmentProgress.value = current
          deleteInstallmentTotal.value = totalItems
        })
      } else if (type === 'recurrent') {
        await recurrentsStore.deleteRecurrent(id)
      } else {
        await investmentEventsStore.deleteEvent(id)
      }
      appToast.success({ title: 'Excluído com sucesso' })
    } catch (e: unknown) {
      appToast.error({ title: 'Erro ao excluir', description: getErrorMessage(e, 'Nao foi possivel excluir o item.') })
    } finally {
      closeDeleteInstallmentModal()
      processingAction.value = null
      confirmDeleteOpen.value = false
      deleteTarget.value = null
    }
  }

  function resetInvestmentEventForm() {
    investmentEventForm.positionId = ''
    investmentEventForm.date = nowISO()
    investmentEventForm.event_type = 'buy'
    investmentEventForm.quantity = ''
    investmentEventForm.unit_price = ''
    investmentEventForm.amount = ''
    investmentEventForm.note = ''
  }

  async function submitInvestmentEvent() {
    if (isProcessing.value) return
    if (!editingInvestmentEvent.value) return
    savingInvestmentEvent.value = true

    try {
      if (!investmentEventForm.positionId) throw new Error('Selecione um ativo')
      if (!investmentEventForm.date) throw new Error('Informe a data')
      if (!investmentEventForm.amount) throw new Error('Informe o valor total')
      const amountCents = parseBRLToCents(investmentEventForm.amount)
      if (amountCents <= 0) throw new Error('Valor do evento deve ser maior que zero')

      const position = selectedInvestmentPosition.value
      if (!position) throw new Error('Ativo invalido')

      if (position.investment_type === 'caixinha' && investmentEventForm.event_type === 'maturity') {
        throw new Error('Evento vencimento nao esta disponivel para caixinha')
      }

      if (position.bucket === 'variable' && (investmentEventForm.event_type === 'buy' || investmentEventForm.event_type === 'sell')) {
        const qty = Number(investmentEventForm.quantity.replace(',', '.'))
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Informe a quantidade')
        if (investmentEventForm.event_type === 'sell') {
          const availableQty = getEffectiveAvailableQuantityForSell(position, editingInvestmentEvent.value)
          if (qty > availableQty) {
            throw new Error(`Voce possui apenas ${formatQuantityDisplay(availableQty)} cotas`)
          }
        }
      }

      const payload = {
        positionId: position.id,
        accountId: position.accountId,
        date: investmentEventForm.date,
        event_type: investmentEventForm.event_type,
        amount_cents: amountCents,
        quantity: investmentEventForm.quantity ? Number(investmentEventForm.quantity.replace(',', '.')) : undefined,
        unit_price_cents: investmentEventForm.unit_price ? parseBRLToCents(investmentEventForm.unit_price) : undefined,
        note: investmentEventForm.note || undefined,
      }

      await investmentEventsStore.updateEvent(editingInvestmentEvent.value.id, payload)
      appToast.success({ title: 'Lancamento atualizado' })
      investmentEventDialogOpen.value = false
    } catch (e: unknown) {
      appToast.error({
        title: 'Erro ao atualizar lancamento',
        description: getErrorMessage(e, 'Nao foi possivel atualizar o lancamento.'),
      })
    } finally {
      savingInvestmentEvent.value = false
    }
  }

  // ── Focus helpers (for defineExpose) ──

  async function focusTransaction(txId: string) {
    if (isProcessing.value) return false
    const target = transactionsStore.transactions.find(tx => tx.id === txId)
    if (!target) return false

    activeTab.value = 'transacoes'
    txFilterConta.value = null
    txFilterMes.value = ''
    txFilterStatus.value = 'todos'
    txGoToPage.value = ''

    await nextTick()

    const groupedParentId = target.installment?.parentId
    const rowTarget = groupedParentId
      ? (filteredTransactions.value.find(tx => tx.installment?.parentId === groupedParentId) ?? target)
      : target

    const index = filteredTransactions.value.findIndex(tx => tx.id === rowTarget.id)
    if (index >= 0) {
      setTxPage(Math.floor(index / txPageSize.value) + 1)
    }

    openViewTransaction(target)
    return true
  }

  async function focusRecurrent(recId: string) {
    if (isProcessing.value) return false
    const target = recurrentsStore.recurrents.find(rec => rec.id === recId)
    if (!target) return false

    activeTab.value = 'recorrentes'
    recFilterConta.value = null
    recFilterStatus.value = 'todos'
    recGoToPage.value = ''

    await nextTick()

    const index = filteredRecurrents.value.findIndex(rec => rec.id === recId)
    if (index >= 0) {
      setRecPage(Math.floor(index / recPageSize.value) + 1)
    }

    openViewRecurrent(target)
    return true
  }

  onBeforeRouteLeave(() => {
    if (!showDeleteInstallmentModal.value) return true

    appToast.warning({
      title: 'Operação em andamento',
      description: 'Aguarde a conclusão. A navegação e os cliques estão temporariamente bloqueados.',
    })
    return false
  })

  return {
    // Stores (for template direct use)
    accountsStore, investmentPositionsStore,
    // Filter state
    txFiltersOpen, recFiltersOpen, invFiltersOpen,
    activeTab,
    txFilterConta, txFilterMes, txFilterStatus,
    recFilterConta, recFilterStatus,
    invFilterConta,
    // Investment event form
    investmentEventDialogOpen, editingInvestmentEvent,
    savingInvestmentEvent,
    investmentEventForm, investmentEventTypeOptions,
    availableSellQuantity, selectedInvestmentPosition,
    // Expand state
    expandedParents,
    // View state
    viewingTransaction, transactionViewDialogOpen,
    viewingRecurrent, recurrentViewDialogOpen,
    isProcessing, processingAction,
    showDeleteInstallmentModal,
    deleteInstallmentProgress, deleteInstallmentTotal,
    deleteInstallmentPercent, deleteInstallmentCurrentStep,
    deleteInstallmentCurrentLabel, deleteInstallmentStepMeta,
    // Confirm delete
    confirmDeleteOpen, deleteTarget,
    // Options
    txStatusOptions, recStatusOptions, pageSizeOptions,
    // Filter status
    hasTxFilters, hasRecFilters, hasInvFilters,
    // Filtered lists
    filteredTransactions, filteredRecurrents, filteredInvestments,
    // Pagination — transactions
    txPageSize, txPage, txGoToPage,
    txTotalItems, txTotalPages,
    txPageStart, txPageEnd,
    paginatedTransactions,
    // Pagination — recurrents
    recPageSize, recPage, recGoToPage,
    recTotalItems, recTotalPages,
    recPageStart, recPageEnd,
    paginatedRecurrents,
    // Pagination — investments
    invPageSize, invPage, invGoToPage,
    invTotalItems, invTotalPages,
    invPageStart, invPageEnd,
    paginatedInvestments,
    // Helpers
    getAccountLabel, getTransactionDisplayAmountCents,
    getPositionLabel, getPositionBucketLabel, formatDisplayDate,
    formatCentsToInput, formatQuantityDisplay,
    canMarkUnpaidTransaction,
    // Actions
    toggleExpand,
    openViewTransaction, openViewRecurrent,
    editTransaction, editRecurrent,
    requestDelete, requestDeleteTransaction,
    markTransactionUnpaid,
    openEditInvestmentEvent,
    onInvestmentEventDialogOpenChange,
    cancelDelete, confirmDelete,
    clearTxFilters, clearRecFilters, clearInvFilters,
    setTxPage, setRecPage, setInvPage,
    submitTxGoToPage, submitRecGoToPage, submitInvGoToPage,
    submitInvestmentEvent,
    // Expose
    focusTransaction, focusRecurrent,
  }
}


