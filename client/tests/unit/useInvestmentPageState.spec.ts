import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInvestmentPageState } from '~/composables/useInvestmentPageState'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'

const toastMock = {
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
}

const routeState = {
  query: {} as Record<string, any>,
}

const routerReplaceMock = vi.fn()
const onMountedCallbacks: Array<() => unknown> = []

vi.mock('~/composables/useAppToast', () => ({
  useAppToast: () => toastMock,
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<any>('vue')
  return {
    ...actual,
    onMounted: (cb: () => unknown) => {
      onMountedCallbacks.push(cb)
    },
  }
})

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<any>('vue-router')
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn(),
  }
})

describe('useInvestmentPageState', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    onMountedCallbacks.length = 0
    routeState.query = {}
    routerReplaceMock.mockResolvedValue(undefined)
    vi.stubGlobal('useRoute', () => routeState)
    vi.stubGlobal('useRouter', () => ({ replace: routerReplaceMock }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('submitPosition bloqueia ativo duplicado na mesma conta para renda variavel', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 10000 } as any]
    positionsStore.positions = [
      {
        id: 'pos-existing',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        is_active: true,
        invested_cents: 0,
      },
    ] as any
    eventsStore.events = []

    const addSpy = vi.spyOn(positionsStore, 'addPosition')
    const state = useInvestmentPageState()

    state.positionForm.accountId = 1
    state.positionForm.bucket = 'variable'
    state.positionForm.investment_type = 'fii'
    state.positionForm.asset_code = 'hglg11'
    await state.submitPosition()

    expect(addSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })

  it('submitPosition bloqueia mudanca de conta quando ativo editado possui lancamentos', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 10000 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco', type: 'bank', balance_cents: 5000 } as any,
    ]
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'fixed',
        investment_type: 'cdb',
        asset_code: 'CDB_A',
        is_active: true,
        invested_cents: 0,
      },
    ] as any
    eventsStore.events = [
      {
        id: 'evt-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-03-10',
        event_type: 'contribution',
        amount_cents: 1000,
      },
    ] as any

    const updateSpy = vi.spyOn(positionsStore, 'updatePosition')
    const state = useInvestmentPageState()
    state.openEditPosition(positionsStore.positions[0] as any)

    state.positionForm.accountId = 2
    await state.submitPosition()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro ao atualizar ativo',
      description: expect.stringMatching(/alterar a conta/i),
    }))
  })

  it('submitPosition bloqueia mudanca de bucket quando ativo editado possui lancamentos', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 10000 } as any]
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        is_active: true,
        invested_cents: 0,
      },
    ] as any
    eventsStore.events = [
      {
        id: 'evt-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-03-10',
        event_type: 'buy',
        amount_cents: 1000,
      },
    ] as any

    const updateSpy = vi.spyOn(positionsStore, 'updatePosition')
    const state = useInvestmentPageState()
    state.openEditPosition(positionsStore.positions[0] as any)

    state.positionForm.bucket = 'fixed'
    await state.submitPosition()

    expect(updateSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro ao atualizar ativo',
      description: expect.stringMatching(/alterar o grupo/i),
    }))
  })

  it('submitEvent bloqueia evento maturity para ativo caixinha', async () => {
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    positionsStore.positions = [
      {
        id: 'pos-caixinha',
        accountId: 1,
        bucket: 'fixed',
        investment_type: 'caixinha',
        asset_code: 'CAIXINHA',
        is_active: true,
        invested_cents: 0,
      },
    ] as any
    eventsStore.events = []

    const addEventSpy = vi.spyOn(eventsStore, 'addEvent')
    const state = useInvestmentPageState()

    state.eventForm.positionId = 'pos-caixinha'
    state.eventForm.date = '2026-03-10'
    state.eventForm.event_type = 'maturity'
    state.eventForm.amount = '10,00'
    await state.submitEvent()

    expect(addEventSpy).not.toHaveBeenCalled()
    expect(toastMock.error).toHaveBeenCalledTimes(1)
  })

  it('confirmDelete executa exclusao de posicao em cascata e limpa estado de progresso', async () => {
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        is_active: true,
        invested_cents: 0,
      },
    ] as any
    eventsStore.events = []

    const deleteCascadeSpy = vi.spyOn(eventsStore, 'deletePositionCascade').mockImplementation(async (_id, options) => {
      options?.onProgress?.({ deleted: 1, total: 2 })
      options?.onProgress?.({ deleted: 2, total: 2 })
      return { deleted: 2, total: 2 }
    })

    const state = useInvestmentPageState()
    state.requestDeletePosition(positionsStore.positions[0] as any)
    expect(state.confirmDeleteOpen.value).toBe(true)

    await state.confirmDelete()

    expect(deleteCascadeSpy).toHaveBeenCalledWith('pos-1', expect.any(Object))
    expect(toastMock.success).toHaveBeenCalledTimes(1)
    expect(state.confirmDeleteOpen.value).toBe(false)
    expect(state.showDeletePositionProgressModal.value).toBe(false)
    expect(state.deleteTarget.value).toBeNull()
  })

  it('loadPageData marca erro parcial quando recalculo de posicoes falha', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(accountsStore, 'loadAccounts').mockResolvedValue(undefined as any)
    vi.spyOn(positionsStore, 'loadPositions').mockResolvedValue(undefined as any)
    vi.spyOn(eventsStore, 'loadEvents').mockResolvedValue(undefined as any)
    vi.spyOn(eventsStore, 'recomputeAllPositions').mockResolvedValue({
      total: 2,
      succeeded: 1,
      failed: 1,
    })

    const state = useInvestmentPageState()
    await state.loadPageData()

    expect(state.hasPartialLoadError.value).toBe(true)
    expect(state.hasFatalLoadError.value).toBe(false)
    expect(state.loadErrorMessage.value).toContain('recalculo de investimentos')
  })

  it('submitPosition cria novo ativo de renda fixa com metadata normalizada', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 10000 } as any]
    positionsStore.positions = []

    const addSpy = vi.spyOn(positionsStore, 'addPosition').mockResolvedValue(undefined as any)
    const state = useInvestmentPageState()

    state.positionForm.accountId = 1
    state.positionForm.bucket = 'fixed'
    state.positionForm.investment_type = 'cdb'
    state.positionForm.asset_code = 'cdb_teste'
    state.positionForm.name = 'CDB XP'
    state.positionForm.issuer = 'XP'
    state.positionForm.indexer = 'CDI'
    state.positionForm.rate_mode = 'pct_cdi'
    state.positionForm.rate_percent = '120,5'
    state.positionForm.liquidity = 'D1'
    await state.submitPosition()

    expect(addSpy).toHaveBeenCalledTimes(1)
    const payload = addSpy.mock.calls[0]?.[0] as any
    expect(payload).toMatchObject({
      accountId: 1,
      bucket: 'fixed',
      investment_type: 'cdb',
      asset_code: 'CDB_TESTE',
      name: 'CDB XP',
      metadata: expect.objectContaining({
        issuer: 'XP',
        indexer: 'CDI',
        rate_mode: 'pct_cdi',
        rate_percent: 120.5,
        liquidity: 'D1',
      }),
    })
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('submitEvent registra evento valido para ativo variavel com quantidade e preco unitario', async () => {
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        quantity_total: 20,
      },
    ] as any
    eventsStore.events = []

    const addSpy = vi.spyOn(eventsStore, 'addEvent').mockResolvedValue(undefined as any)
    const state = useInvestmentPageState()

    state.eventForm.positionId = 'pos-var'
    state.eventForm.date = '2026-03-10'
    state.eventForm.event_type = 'buy'
    state.eventForm.quantity = '2'
    state.eventForm.unit_price = '10,00'
    state.eventForm.amount = '20,00'
    state.eventForm.note = 'Aporte mensal'
    await state.submitEvent()

    expect(addSpy).toHaveBeenCalledTimes(1)
    expect(addSpy.mock.calls[0]?.[0]).toMatchObject({
      positionId: 'pos-var',
      accountId: 1,
      event_type: 'buy',
      amount_cents: 2000,
      quantity: 2,
      unit_price_cents: 1000,
      note: 'Aporte mensal',
    })
    expect(toastMock.success).toHaveBeenCalledTimes(1)
  })

  it('confirmDelete de evento chama deleteEvent e limpa estado de confirmacao', async () => {
    const eventsStore = useInvestmentEventsStore()
    const deleteSpy = vi.spyOn(eventsStore, 'deleteEvent').mockResolvedValue(undefined as any)

    const state = useInvestmentPageState()
    state.deleteTarget.value = { type: 'event', id: 'evt-1', label: 'Evento' } as any
    state.confirmDeleteOpen.value = true

    await state.confirmDelete()

    expect(deleteSpy).toHaveBeenCalledWith('evt-1')
    expect(state.confirmDeleteOpen.value).toBe(false)
    expect(state.deleteTarget.value).toBeNull()
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('confirmDelete de evento trata falha sem deixar estado preso', async () => {
    const eventsStore = useInvestmentEventsStore()
    vi.spyOn(eventsStore, 'deleteEvent').mockRejectedValueOnce(new Error('falha delete evento'))

    const state = useInvestmentPageState()
    state.deleteTarget.value = { type: 'event', id: 'evt-1', label: 'Evento' } as any
    state.confirmDeleteOpen.value = true

    await state.confirmDelete()

    expect(toastMock.error).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Erro ao excluir',
      description: 'falha delete evento',
    }))
    expect(state.confirmDeleteOpen.value).toBe(false)
    expect(state.deleteTarget.value).toBeNull()
    expect(state.deleting.value).toBe(false)
  })

  it('onMounted aplica foco por query e limpa query no router quando posicao existe', async () => {
    const accountsStore = useAccountsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    vi.spyOn(accountsStore, 'loadAccounts').mockResolvedValue(undefined as any)
    vi.spyOn(positionsStore, 'loadPositions').mockResolvedValue(undefined as any)
    vi.spyOn(eventsStore, 'loadEvents').mockResolvedValue(undefined as any)
    vi.spyOn(eventsStore, 'recomputeAllPositions').mockResolvedValue({
      total: 0,
      succeeded: 0,
      failed: 0,
    })

    positionsStore.positions = [
      {
        id: 'pos-focus',
        accountId: 1,
        bucket: 'variable',
        investment_type: 'fii',
        asset_code: 'HGLG11',
        is_active: true,
        invested_cents: 0,
      },
    ] as any

    routeState.query = {
      positionId: 'pos-focus',
      bucket: 'variable',
      extra: 'keep-me',
    }

    const state = useInvestmentPageState()
    await state.loadPageData()
    await nextTick()

    expect(state.activeBucket.value).toBe('variable')
    expect(state.positionViewDialogOpen.value).toBe(true)
    expect(state.viewingPosition.value?.id).toBe('pos-focus')
    expect(routerReplaceMock).toHaveBeenCalledWith({
      query: { extra: 'keep-me' },
    })
  })
})
