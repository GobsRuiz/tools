import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { apiAtomicMock, apiDeleteMock, apiPatchMock, getMockDb, resetMockApi } from '../helpers/mockApi'

describe('useInvestmentEventsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('recomputePosition atualiza quantidade e custo medio para renda variavel', async () => {
    resetMockApi({
      investment_positions: [
        {
          id: 'pos-var',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'evt-1',
        positionId: 'pos-var',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      },
      {
        id: 'evt-2',
        positionId: 'pos-var',
        accountId: 1,
        date: '2026-01-10',
        event_type: 'buy',
        amount_cents: 20000,
        quantity: 10,
      },
      {
        id: 'evt-3',
        positionId: 'pos-var',
        accountId: 1,
        date: '2026-01-20',
        event_type: 'sell',
        amount_cents: 15000,
        quantity: 5,
      },
    ] as any

    await eventsStore.recomputePosition('pos-var')

    const updated = positionsStore.positions.find(p => p.id === 'pos-var')
    expect(updated?.quantity_total).toBe(15)
    expect(updated?.avg_cost_cents).toBe(1500)
    expect(updated?.invested_cents).toBe(22500)
  })

  it('recomputePosition atualiza principal e valor atual para renda fixa', async () => {
    resetMockApi({
      investment_positions: [
        {
          id: 'pos-fix',
          accountId: 1,
          bucket: 'fixed',
          asset_code: 'CDB-X',
          name: 'CDB',
          investment_type: 'cdb',
          principal_cents: 0,
          current_value_cents: 0,
          invested_cents: 0,
        },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-fix',
        accountId: 1,
        bucket: 'fixed',
        asset_code: 'CDB-X',
        name: 'CDB',
        investment_type: 'cdb',
        principal_cents: 0,
        current_value_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'evt-a',
        positionId: 'pos-fix',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'contribution',
        amount_cents: 10000,
      },
      {
        id: 'evt-b',
        positionId: 'pos-fix',
        accountId: 1,
        date: '2026-01-05',
        event_type: 'income',
        amount_cents: 1000,
      },
      {
        id: 'evt-c',
        positionId: 'pos-fix',
        accountId: 1,
        date: '2026-01-10',
        event_type: 'withdrawal',
        amount_cents: 3000,
      },
    ] as any

    await eventsStore.recomputePosition('pos-fix')

    const updated = positionsStore.positions.find(p => p.id === 'pos-fix')
    expect(updated?.principal_cents).toBe(7000)
    expect(updated?.current_value_cents).toBe(8000)
    expect(updated?.invested_cents).toBe(8000)
  })

  it('addEvent e deleteEvent aplicam ajuste de saldo da conta', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 },
      ],
      investment_positions: [
        {
          id: 'pos-var',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'BOVA11',
          name: 'ETF',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 } as any,
    ]

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'BOVA11',
        name: 'ETF',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const adjustSpy = vi.spyOn(accountsStore, 'adjustBalance').mockResolvedValue(undefined as any)

    const eventsStore = useInvestmentEventsStore()
    const created = await eventsStore.addEvent({
      positionId: 'pos-var',
      accountId: 1,
      date: '2026-02-01',
      event_type: 'buy',
      amount_cents: 10000,
      quantity: 2,
      unit_price_cents: 5000,
      note: 'Compra inicial',
    } as any)

    expect(adjustSpy).toHaveBeenCalledWith(1, -10000, 'Compra investimento')

    await eventsStore.deleteEvent(created.id)
    expect(adjustSpy).toHaveBeenCalledWith(1, 10000, 'Compra investimento')
  })

  it('addEvent faz rollback quando ajuste de saldo falha apos persistencia', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 },
      ],
      investment_positions: [
        {
          id: 'pos-var',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'BOVA11',
          name: 'ETF',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 } as any,
    ]
    vi.spyOn(accountsStore, 'adjustBalance').mockRejectedValueOnce(new Error('falha ajuste'))

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'BOVA11',
        name: 'ETF',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    await expect(eventsStore.addEvent({
      positionId: 'pos-var',
      accountId: 1,
      date: '2026-02-01',
      event_type: 'buy',
      amount_cents: 10000,
      quantity: 2,
      unit_price_cents: 5000,
      note: 'Compra inicial',
    } as any)).rejects.toThrow('falha ajuste')

    expect(eventsStore.events).toHaveLength(0)
  })

  it('addEvent rejeita amount_cents menor ou igual a zero', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 },
      ],
      investment_positions: [
        {
          id: 'pos-var',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'BOVA11',
          name: 'ETF',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'BOVA11',
        name: 'ETF',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    await expect(eventsStore.addEvent({
      positionId: 'pos-var',
      accountId: 1,
      date: '2026-02-01',
      event_type: 'buy',
      amount_cents: 0,
      quantity: 2,
      unit_price_cents: 0,
      note: 'Valor invalido',
    } as any)).rejects.toThrow('Valor do evento deve ser maior que zero')
  })

  it('addEvent rejeita campo fees_cents (campo removido)', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Investimentos', bank: 'Banco X', balance_cents: 50000 },
      ],
      investment_positions: [
        {
          id: 'pos-var',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'BOVA11',
          name: 'ETF',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-var',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'BOVA11',
        name: 'ETF',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    await expect(eventsStore.addEvent({
      positionId: 'pos-var',
      accountId: 1,
      date: '2026-02-01',
      event_type: 'buy',
      amount_cents: 10000,
      quantity: 2,
      unit_price_cents: 5000,
      fees_cents: 100,
    } as any)).rejects.toThrow('fees_cents foi removido')
  })

  it('deleteEventsByPosition exclui em lote sem recomputar a cada evento quando skipRecompute=true', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        {
          id: 'e-1',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 1000,
        },
        {
          id: 'e-2',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-02',
          event_type: 'buy',
          amount_cents: 2000,
        },
        {
          id: 'e-3',
          positionId: 'pos-2',
          accountId: 1,
          date: '2026-01-03',
          event_type: 'buy',
          amount_cents: 3000,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'e-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 1000,
      },
      {
        id: 'e-2',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-02',
        event_type: 'buy',
        amount_cents: 2000,
      },
      {
        id: 'e-3',
        positionId: 'pos-2',
        accountId: 1,
        date: '2026-01-03',
        event_type: 'buy',
        amount_cents: 3000,
      },
    ] as any

    const recomputeSpy = vi.spyOn(eventsStore, 'recomputePosition')
    const adjustSpy = vi.spyOn(accountsStore, 'adjustBalance').mockResolvedValue(undefined as any)

    const result = await eventsStore.deleteEventsByPosition('pos-1', { skipRecompute: true })

    expect(result.deleted).toBe(2)
    expect(eventsStore.events.map(event => event.id)).toEqual(['e-3'])
    expect(recomputeSpy).not.toHaveBeenCalled()
    expect(adjustSpy).toHaveBeenCalledTimes(1)
    expect(adjustSpy).toHaveBeenCalledWith(1, 3000, 'Reversao por exclusao de ativo')
  })

  it('updateEvent faz rollback do patch quando ajuste de saldo falha', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-1',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]
    vi.spyOn(accountsStore, 'adjustBalance').mockRejectedValueOnce(new Error('falha ajuste update'))

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    await expect(eventsStore.updateEvent('event-1', {
      amount_cents: 12000,
      quantity: 12,
    })).rejects.toMatchObject({
      stage: 'update_event_post_process',
      rollbackApplied: true,
      message: 'falha ajuste update',
    })

    expect(eventsStore.events[0]?.amount_cents).toBe(10000)
    expect(getMockDb().investment_events.find(event => event.id === 'event-1')?.amount_cents).toBe(10000)
  })

  it('updateEvent serializa updates concorrentes no mesmo evento e preserva saldo final correto', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-1',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 } as any,
    ]

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    let releaseFirstPatch!: () => void
    const firstPatchGate = new Promise<void>((resolve) => {
      releaseFirstPatch = resolve
    })
    apiPatchMock.mockImplementationOnce(async (path: string, body: any) => {
      expect(path).toBe('/investment_events/event-1')
      await firstPatchGate
      const db = getMockDb()
      const row = db.investment_events.find(event => event.id === 'event-1')
      if (!row) throw new Error('evento de teste nao encontrado')
      Object.assign(row, body)
      return { ...row }
    })

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    const firstUpdate = eventsStore.updateEvent('event-1', { amount_cents: 12000, quantity: 12 })
    const secondUpdate = eventsStore.updateEvent('event-1', { amount_cents: 7000, quantity: 7 })

    releaseFirstPatch()
    await Promise.all([firstUpdate, secondUpdate])

    expect(apiPatchMock.mock.calls.filter(([path]) => path === '/investment_events/event-1')).toHaveLength(2)
    expect(eventsStore.events.find(event => event.id === 'event-1')?.amount_cents).toBe(7000)
    expect(accountsStore.accounts.find(account => account.id === 1)?.balance_cents).toBe(93000)
  })

  it('deleteEvent restaura evento quando pós-processamento falha', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-1',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]
    vi.spyOn(accountsStore, 'adjustBalance').mockRejectedValueOnce(new Error('falha ajuste delete'))

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    await expect(eventsStore.deleteEvent('event-1')).rejects.toMatchObject({
      stage: 'delete_event',
      rollbackApplied: true,
      message: 'falha ajuste delete',
    })

    expect(eventsStore.events.map(event => event.id)).toContain('event-1')
    expect(getMockDb().investment_events.map(event => event.id)).toContain('event-1')
  })

  it('deleteEvent deduplica chamadas concorrentes e evita estorno duplicado', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-1',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 } as any,
    ]
    const adjustSpy = vi.spyOn(accountsStore, 'adjustBalance')

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    const deleteBase = apiDeleteMock.getMockImplementation()
    let releaseDelete!: () => void
    const deleteGate = new Promise<void>((resolve) => {
      releaseDelete = resolve
    })
    apiDeleteMock.mockImplementation(async (path: string) => {
      if (path === '/investment_events/event-1') {
        await deleteGate
      }
      return deleteBase?.(path) as any
    })

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-1',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    const firstDelete = eventsStore.deleteEvent('event-1')
    const secondDelete = eventsStore.deleteEvent('event-1')

    releaseDelete()
    await Promise.all([firstDelete, secondDelete])

    expect(apiDeleteMock.mock.calls.filter(([path]) => path === '/investment_events/event-1')).toHaveLength(1)
    expect(adjustSpy).toHaveBeenCalledTimes(1)
    expect(eventsStore.events.find(event => event.id === 'event-1')).toBeUndefined()
  })

  it('recomputeAllPositions retorna total de sucesso e falha por posição', async () => {
    resetMockApi({
      investment_positions: [
        { id: 'pos-1', accountId: 1, bucket: 'fixed', asset_code: 'CDB', investment_type: 'cdb', name: 'CDB' },
        { id: 'pos-2', accountId: 1, bucket: 'fixed', asset_code: 'LCA', investment_type: 'lca', name: 'LCA' },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      { id: 'pos-1', accountId: 1, bucket: 'fixed', asset_code: 'CDB', investment_type: 'cdb', name: 'CDB' } as any,
      { id: 'pos-2', accountId: 1, bucket: 'fixed', asset_code: 'LCA', investment_type: 'lca', name: 'LCA' } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    const updateSpy = vi.spyOn(positionsStore, 'updatePosition')
      .mockResolvedValueOnce(undefined as any)
      .mockRejectedValueOnce(new Error('falha recompute em pos-2'))

    const result = await eventsStore.recomputeAllPositions()

    expect(updateSpy).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      total: 2,
      succeeded: 1,
      failed: 1,
    })
  })

  it('deleteEventsByPosition falha no meio e nao aplica ajuste parcial de saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
        { id: 'e-2', positionId: 'pos-1', accountId: 1, date: '2026-01-02', event_type: 'buy', amount_cents: 2000 },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]
    const adjustSpy = vi.spyOn(accountsStore, 'adjustBalance')

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      { id: 'e-2', positionId: 'pos-1', accountId: 1, date: '2026-01-02', event_type: 'buy', amount_cents: 2000 },
    ] as any

    const originalDelete = apiDeleteMock.getMockImplementation()
    apiDeleteMock
      .mockImplementationOnce(async (path: string) => originalDelete?.(path) as any)
      .mockImplementationOnce(async () => { throw new Error('falha no segundo delete') })

    await expect(eventsStore.deleteEventsByPosition('pos-1')).rejects.toThrow('falha no segundo delete')

    expect(adjustSpy).not.toHaveBeenCalled()
    expect(eventsStore.events.map(event => event.id)).toEqual(['e-1', 'e-2'])
  })

  it('deletePositionCascade usa caminho atomico quando IPC está disponivel', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      ],
    })

    const previousElectronApi = (window as any).electronAPI
    ;(window as any).electronAPI = { atomic: true }
    apiAtomicMock.mockResolvedValueOnce({ positionDeleted: 1, eventsDeleted: 1 } as any)

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
    ] as any

    const progress: Array<{ deleted: number, total: number }> = []
    const result = await eventsStore.deletePositionCascade('pos-1', {
      onProgress: item => progress.push(item),
    })

    expect(apiAtomicMock).toHaveBeenCalledWith('deletePositionCascade', { positionId: 'pos-1' })
    expect(result).toEqual({ deleted: 1, total: 1 })
    expect(positionsStore.positions).toHaveLength(0)
    expect(eventsStore.events).toHaveLength(0)
    expect(progress).toEqual([{ deleted: 0, total: 1 }, { deleted: 1, total: 1 }])

    ;(window as any).electronAPI = previousElectronApi
  })

  it('deletePositionCascade em fallback remove eventos e depois remove posicao', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
        { id: 'e-2', positionId: 'pos-1', accountId: 1, date: '2026-01-02', event_type: 'buy', amount_cents: 1000 },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      { id: 'e-2', positionId: 'pos-1', accountId: 1, date: '2026-01-02', event_type: 'buy', amount_cents: 1000 },
    ] as any
    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]

    const deletePositionSpy = vi.spyOn(positionsStore, 'deletePosition')
    const result = await eventsStore.deletePositionCascade('pos-1')

    expect(result).toEqual({ deleted: 2, total: 2 })
    expect(deletePositionSpy).toHaveBeenCalledWith('pos-1')
    expect(eventsStore.events).toHaveLength(0)
    expect(positionsStore.positions).toHaveLength(0)
  })

  it('deletePositionCascade deduplica chamadas concorrentes para a mesma posicao', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]
    const deletePositionBase = positionsStore.deletePosition.bind(positionsStore)
    let resolveDelete!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })
    const deletePositionSpy = vi.spyOn(positionsStore, 'deletePosition').mockImplementation(async (...args: any[]) => {
      await gate
      return deletePositionBase(...args)
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      { id: 'e-1', positionId: 'pos-1', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
    ] as any

    const firstCall = eventsStore.deletePositionCascade('pos-1')
    const secondCall = eventsStore.deletePositionCascade('pos-1')
    resolveDelete()

    const [firstResult, secondResult] = await Promise.all([firstCall, secondCall])
    expect(firstResult).toEqual(secondResult)
    expect(deletePositionSpy).toHaveBeenCalledTimes(1)
    expect(eventsStore.events).toHaveLength(0)
  })

  it('updateEvent libera lock apos falha e permite retry com sucesso', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-retry',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 } as any,
    ]
    vi.spyOn(accountsStore, 'adjustBalance')
      .mockRejectedValueOnce(new Error('falha ajuste update retry'))
      .mockImplementation(async (accountId: number, deltaCents: number) => {
        const account = accountsStore.accounts.find(item => item.id === accountId)
        if (account) account.balance_cents += deltaCents
      })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-retry',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    await expect(eventsStore.updateEvent('event-retry', { amount_cents: 8000, quantity: 8 }))
      .rejects.toMatchObject({ stage: 'update_event_post_process', rollbackApplied: true })

    const retried = await eventsStore.updateEvent('event-retry', { amount_cents: 7000, quantity: 7 })
    expect(retried.amount_cents).toBe(7000)
    expect(eventsStore.events.find(event => event.id === 'event-retry')?.amount_cents).toBe(7000)
  })

  it('deleteEvent libera lock apos falha e permite retry com sucesso', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 },
      ],
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 10,
          avg_cost_cents: 1000,
          invested_cents: 10000,
        },
      ],
      investment_events: [
        {
          id: 'event-delete-retry',
          positionId: 'pos-1',
          accountId: 1,
          date: '2026-01-01',
          event_type: 'buy',
          amount_cents: 10000,
          quantity: 10,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 90000 } as any,
    ]
    vi.spyOn(accountsStore, 'adjustBalance')
      .mockRejectedValueOnce(new Error('falha ajuste delete retry'))
      .mockImplementation(async (accountId: number, deltaCents: number) => {
        const account = accountsStore.accounts.find(item => item.id === accountId)
        if (account) account.balance_cents += deltaCents
      })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-1',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 10,
        avg_cost_cents: 1000,
        invested_cents: 10000,
      } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      {
        id: 'event-delete-retry',
        positionId: 'pos-1',
        accountId: 1,
        date: '2026-01-01',
        event_type: 'buy',
        amount_cents: 10000,
        quantity: 10,
      } as any,
    ]

    await expect(eventsStore.deleteEvent('event-delete-retry'))
      .rejects.toMatchObject({ stage: 'delete_event', rollbackApplied: true })

    await eventsStore.deleteEvent('event-delete-retry')
    expect(eventsStore.events.find(event => event.id === 'event-delete-retry')).toBeUndefined()
  })

  it('deletePositionCascade libera lock apos falha e permite retry com sucesso', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 },
      ],
      investment_positions: [
        {
          id: 'pos-retry',
          accountId: 1,
          bucket: 'variable',
          asset_code: 'PETR4',
          name: 'Petrobras',
          investment_type: 'stock',
          quantity_total: 0,
          avg_cost_cents: 0,
          invested_cents: 0,
        },
      ],
      investment_events: [
        { id: 'e-retry', positionId: 'pos-retry', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      ],
    })

    const positionsStore = useInvestmentPositionsStore()
    positionsStore.positions = [
      {
        id: 'pos-retry',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]

    const deletePositionSpy = vi.spyOn(positionsStore, 'deletePosition')
      .mockRejectedValueOnce(new Error('falha delete position retry'))
      .mockResolvedValue(undefined as any)

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]

    const eventsStore = useInvestmentEventsStore()
    eventsStore.events = [
      { id: 'e-retry', positionId: 'pos-retry', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
    ] as any

    await expect(eventsStore.deletePositionCascade('pos-retry')).rejects.toThrow('falha delete position retry')

    // Retry needs fresh local state because first attempt removed events before failing at position delete.
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 }],
      investment_positions: [{
        id: 'pos-retry',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      }],
      investment_events: [
        { id: 'e-retry', positionId: 'pos-retry', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
      ],
    })
    positionsStore.positions = [
      {
        id: 'pos-retry',
        accountId: 1,
        bucket: 'variable',
        asset_code: 'PETR4',
        name: 'Petrobras',
        investment_type: 'stock',
        quantity_total: 0,
        avg_cost_cents: 0,
        invested_cents: 0,
      } as any,
    ]
    eventsStore.events = [
      { id: 'e-retry', positionId: 'pos-retry', accountId: 1, date: '2026-01-01', event_type: 'buy', amount_cents: 1000 },
    ] as any
    accountsStore.accounts = [
      { id: 1, label: 'Conta 1', bank: 'Banco X', balance_cents: 100000 } as any,
    ]

    const result = await eventsStore.deletePositionCascade('pos-retry')
    expect(result).toEqual({ deleted: 1, total: 1 })
    expect(deletePositionSpy).toHaveBeenCalledTimes(2)
  })
})
