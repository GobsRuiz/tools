import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useMovimentacoesState } from '~/composables/useMovimentacoesState'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

vi.mock('~/composables/useAppToast', () => ({
  useAppToast: () => toastMock,
}))

vi.mock('vue-router', () => ({
  onBeforeRouteLeave: vi.fn(),
}))

function createEmitSpy() {
  return vi.fn() as any
}

describe('useMovimentacoesState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('filtra e deduplica transacoes por parentId de parcelas', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', balance_cents: 10000 } as any]
    recurrentsStore.recurrents = []
    positionsStore.positions = []
    eventsStore.events = []
    transactionsStore.transactions = [
      {
        id: 'inst-2',
        accountId: 1,
        date: '2026-03-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -1000,
        paid: false,
        installment: { parentId: 'grp-1', index: 2, total: 3, product: 'Notebook' },
        createdAt: '2026-03-15',
      },
      {
        id: 'inst-1',
        accountId: 1,
        date: '2026-03-10',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -1000,
        paid: false,
        installment: { parentId: 'grp-1', index: 1, total: 3, product: 'Notebook' },
        createdAt: '2026-03-10',
      },
      {
        id: 'single-1',
        accountId: 1,
        date: '2026-03-20',
        type: 'income',
        amount_cents: 5000,
        paid: true,
        installment: null,
        createdAt: '2026-03-20',
      },
    ] as any

    const state = useMovimentacoesState({}, createEmitSpy())
    state.txFilterMes.value = '2026-03'

    const ids = state.filteredTransactions.value.map(item => item.id)
    expect(ids).toEqual(['single-1', 'inst-2'])
  })

  it('bloqueia exclusao de transacao de credito paga', () => {
    const state = useMovimentacoesState({}, createEmitSpy())
    const tx = {
      id: 'tx-credit-paid',
      type: 'expense',
      payment_method: 'credit',
      paid: true,
      installment: null,
      description: 'Compra no cartao',
    } as any

    state.requestDeleteTransaction(tx)

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    expect(state.confirmDeleteOpen.value).toBe(false)
    expect(state.deleteTarget.value).toBeNull()
  })

  it('bloqueia exclusao de grupo parcelado quando existe parcela de credito paga', () => {
    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'inst-paid',
        accountId: 1,
        date: '2026-03-01',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -1000,
        paid: true,
        installment: { parentId: 'grp-1', index: 1, total: 3, product: 'Notebook' },
      },
    ] as any

    const state = useMovimentacoesState({}, createEmitSpy())
    const tx = transactionsStore.transactions[0]
    state.requestDeleteTransaction(tx as any)

    expect(toastMock.warning).toHaveBeenCalledTimes(1)
    expect(state.deleteTarget.value).toBeNull()
  })

  it('confirmDelete executa exclusao de grupo de parcelas e limpa estado de confirmacao', async () => {
    const transactionsStore = useTransactionsStore()
    const deleteGroupSpy = vi.spyOn(transactionsStore, 'deleteInstallmentGroup').mockImplementation(async (_id, onProgress) => {
      onProgress?.(1, 2)
      onProgress?.(2, 2)
    })

    transactionsStore.transactions = [
      {
        id: 'inst-1',
        accountId: 1,
        date: '2026-03-01',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -1000,
        paid: false,
        installment: { parentId: 'grp-1', index: 1, total: 2, product: 'Notebook' },
      },
      {
        id: 'inst-2',
        accountId: 1,
        date: '2026-04-01',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -1000,
        paid: false,
        installment: { parentId: 'grp-1', index: 2, total: 2, product: 'Notebook' },
      },
    ] as any

    const state = useMovimentacoesState({}, createEmitSpy())
    state.requestDeleteTransaction(transactionsStore.transactions[0] as any)

    expect(state.confirmDeleteOpen.value).toBe(true)
    await state.confirmDelete()

    expect(deleteGroupSpy).toHaveBeenCalledWith('grp-1', expect.any(Function))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(state.confirmDeleteOpen.value).toBe(false)
    expect(state.deleteTarget.value).toBeNull()
    expect(state.showDeleteInstallmentModal.value).toBe(false)
  })

  it('submitInvestmentEvent valida limite de venda e evita update invalido', async () => {
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        quantity_total: 2,
      },
    ] as any

    const updateSpy = vi.spyOn(eventsStore, 'updateEvent').mockResolvedValue(undefined as any)

    const state = useMovimentacoesState({}, createEmitSpy())
    state.editingInvestmentEvent.value = {
      id: 'evt-1',
      positionId: 'pos-1',
      accountId: 1,
      date: '2026-03-10',
      event_type: 'sell',
      amount_cents: 1000,
      quantity: 1,
    } as any
    state.investmentEventForm.positionId = 'pos-1'
    state.investmentEventForm.date = '2026-03-10'
    state.investmentEventForm.event_type = 'sell'
    state.investmentEventForm.quantity = '5'
    state.investmentEventForm.amount = '10,00'

    await state.submitInvestmentEvent()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })

  it('markTransactionUnpaid executa estorno e emite toast de sucesso', async () => {
    const transactionsStore = useTransactionsStore()
    const markUnpaidSpy = vi.spyOn(transactionsStore, 'markUnpaid').mockResolvedValue(undefined as any)

    const state = useMovimentacoesState({}, createEmitSpy())
    const tx = {
      id: 'tx-1',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -1000,
      paid: true,
      installment: null,
      description: 'Conta de luz',
    } as any

    expect(state.canMarkUnpaidTransaction(tx)).toBe(true)
    await state.markTransactionUnpaid(tx)

    expect(markUnpaidSpy).toHaveBeenCalledWith('tx-1')
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('focusTransaction posiciona aba/lista e abre visualizacao para transacao existente', async () => {
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()

    transactionsStore.transactions = [
      {
        id: 'tx-focus',
        accountId: 1,
        date: '2026-03-05',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -1000,
        paid: false,
        installment: null,
        createdAt: '2026-03-05',
      },
    ] as any
    recurrentsStore.recurrents = []

    const state = useMovimentacoesState({}, createEmitSpy())
    const focused = await state.focusTransaction('tx-focus')

    expect(focused).toBe(true)
    expect(state.activeTab.value).toBe('transacoes')
    expect(state.transactionViewDialogOpen.value).toBe(true)
    expect(state.viewingTransaction.value?.id).toBe('tx-focus')
  })

  it('confirmDelete exclui recorrente e evento de investimento por tipo de alvo', async () => {
    const recurrentsStore = useRecurrentsStore()
    const eventsStore = useInvestmentEventsStore()
    const deleteRecSpy = vi.spyOn(recurrentsStore, 'deleteRecurrent').mockResolvedValue(undefined as any)
    const deleteEventSpy = vi.spyOn(eventsStore, 'deleteEvent').mockResolvedValue(undefined as any)

    const state = useMovimentacoesState({}, createEmitSpy())

    state.deleteTarget.value = { type: 'recurrent', id: 'rec-1', label: 'Recorrente X' } as any
    state.confirmDeleteOpen.value = true
    await state.confirmDelete()
    expect(deleteRecSpy).toHaveBeenCalledWith('rec-1')

    state.deleteTarget.value = { type: 'investment-event', id: 'evt-1', label: 'Evento Y' } as any
    state.confirmDeleteOpen.value = true
    await state.confirmDelete()
    expect(deleteEventSpy).toHaveBeenCalledWith('evt-1')
    expect(toastMock.success).toHaveBeenCalled()
  })
})
