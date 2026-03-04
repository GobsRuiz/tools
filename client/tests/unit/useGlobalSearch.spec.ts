import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalSearch } from '~/composables/useGlobalSearch'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'

describe('useGlobalSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('busca transacao por descricao parcial, case-insensitive e sem acento', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta Casa' } as any]
    transactionsStore.transactions = [
      {
        id: 'tx-1',
        accountId: 1,
        date: '2026-03-01',
        createdAt: '2026-03-01',
        description: 'Café da manhã',
      } as any,
      {
        id: 'tx-2',
        accountId: 1,
        date: '2026-03-02',
        createdAt: '2026-03-02',
      } as any,
    ]
    recurrentsStore.recurrents = []
    positionsStore.positions = []

    const search = useGlobalSearch()
    search.query.value = 'CAFE'

    expect(search.groupedResults.value.transactions).toHaveLength(1)
    expect(search.groupedResults.value.transactions[0]?.id).toBe('tx-1')
  })

  it('limita resultados por grupo em 8 itens', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta Principal' } as any]
    transactionsStore.transactions = Array.from({ length: 12 }, (_, i) => ({
      id: `tx-${i + 1}`,
      accountId: 1,
      date: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      createdAt: `2026-03-${String((i % 28) + 1).padStart(2, '0')}`,
      description: `Mercado ${i + 1}`,
    })) as any
    recurrentsStore.recurrents = Array.from({ length: 12 }, (_, i) => ({
      id: `rec-${i + 1}`,
      accountId: 1,
      name: `Mercado recorrente ${i + 1}`,
      active: true,
    })) as any
    positionsStore.positions = Array.from({ length: 12 }, (_, i) => ({
      id: `pos-${i + 1}`,
      accountId: 1,
      asset_code: `MERC${i + 1}`,
      bucket: 'variable',
    })) as any

    const search = useGlobalSearch()
    search.query.value = 'mercado'

    expect(search.groupedResults.value.transactions).toHaveLength(8)
    expect(search.groupedResults.value.recurrents).toHaveLength(8)
    expect(search.groupedResults.value.investments).toHaveLength(0)
  })

  it('ensureLoaded deduplica chamadas simultaneas e evita recarga sem force', async () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    let resolveLoads!: () => void
    const deferred = new Promise<void>((resolve) => {
      resolveLoads = resolve
    })

    const loadAccountsSpy = vi.spyOn(accountsStore, 'loadAccounts').mockImplementation(() => deferred)
    const loadTransactionsSpy = vi.spyOn(transactionsStore, 'loadTransactions').mockImplementation(() => deferred as any)
    const loadRecurrentsSpy = vi.spyOn(recurrentsStore, 'loadRecurrents').mockImplementation(() => deferred)
    const loadPositionsSpy = vi.spyOn(positionsStore, 'loadPositions').mockImplementation(() => deferred)

    const search = useGlobalSearch()
    const firstCall = search.ensureLoaded()
    const secondCall = search.ensureLoaded()

    expect(search.loading.value).toBe(true)
    expect(loadAccountsSpy).toHaveBeenCalledTimes(1)
    expect(loadTransactionsSpy).toHaveBeenCalledTimes(1)
    expect(loadRecurrentsSpy).toHaveBeenCalledTimes(1)
    expect(loadPositionsSpy).toHaveBeenCalledTimes(1)

    resolveLoads()
    await firstCall
    await secondCall

    expect(search.loading.value).toBe(false)
    expect(search.initialized.value).toBe(true)
    expect(search.loadError.value).toBe('')

    await search.ensureLoaded()
    expect(loadAccountsSpy).toHaveBeenCalledTimes(1)
    expect(loadTransactionsSpy).toHaveBeenCalledTimes(1)
    expect(loadRecurrentsSpy).toHaveBeenCalledTimes(1)
    expect(loadPositionsSpy).toHaveBeenCalledTimes(1)
  })

  it('ensureLoaded com force=true recarrega fontes ja carregadas', async () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    const loadAccountsSpy = vi.spyOn(accountsStore, 'loadAccounts').mockResolvedValue(undefined)
    const loadTransactionsSpy = vi.spyOn(transactionsStore, 'loadTransactions').mockResolvedValue(undefined as any)
    const loadRecurrentsSpy = vi.spyOn(recurrentsStore, 'loadRecurrents').mockResolvedValue(undefined)
    const loadPositionsSpy = vi.spyOn(positionsStore, 'loadPositions').mockResolvedValue(undefined)

    const search = useGlobalSearch()
    await search.ensureLoaded()
    await search.ensureLoaded(true)

    expect(loadAccountsSpy).toHaveBeenCalledTimes(2)
    expect(loadTransactionsSpy).toHaveBeenCalledTimes(2)
    expect(loadRecurrentsSpy).toHaveBeenCalledTimes(2)
    expect(loadPositionsSpy).toHaveBeenCalledTimes(2)
  })

  it('ensureLoaded reporta falha parcial por fonte sem perder as fontes bem-sucedidas', async () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(accountsStore, 'loadAccounts').mockResolvedValue(undefined)
    vi.spyOn(transactionsStore, 'loadTransactions').mockRejectedValue(new Error('timeout tx'))
    vi.spyOn(recurrentsStore, 'loadRecurrents').mockResolvedValue(undefined)
    vi.spyOn(positionsStore, 'loadPositions').mockResolvedValue(undefined)

    const search = useGlobalSearch()
    await search.ensureLoaded()

    expect(search.initialized.value).toBe(false)
    expect(search.sourceStatus.value.accounts).toBe('success')
    expect(search.sourceStatus.value.transactions).toBe('error')
    expect(search.sourceStatus.value.recurrents).toBe('success')
    expect(search.sourceStatus.value.investments).toBe('success')
    expect(search.sourceErrors.value.transactions).toBe('timeout tx')
    expect(search.loadError.value).toContain('transacoes')
  })

  it('ensureLoaded tenta novamente apenas fontes com erro em uma segunda chamada', async () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()

    const loadAccountsSpy = vi.spyOn(accountsStore, 'loadAccounts').mockResolvedValue(undefined)
    const loadTransactionsSpy = vi.spyOn(transactionsStore, 'loadTransactions')
      .mockRejectedValueOnce(new Error('erro temporario'))
      .mockResolvedValueOnce(undefined as any)
    const loadRecurrentsSpy = vi.spyOn(recurrentsStore, 'loadRecurrents').mockResolvedValue(undefined)
    const loadPositionsSpy = vi.spyOn(positionsStore, 'loadPositions').mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const search = useGlobalSearch()
    await search.ensureLoaded()

    expect(search.initialized.value).toBe(false)
    expect(search.sourceStatus.value.transactions).toBe('error')
    expect(loadAccountsSpy).toHaveBeenCalledTimes(1)
    expect(loadRecurrentsSpy).toHaveBeenCalledTimes(1)
    expect(loadPositionsSpy).toHaveBeenCalledTimes(1)
    expect(loadTransactionsSpy).toHaveBeenCalledTimes(1)

    await search.ensureLoaded()

    expect(search.initialized.value).toBe(true)
    expect(search.sourceStatus.value.transactions).toBe('success')
    expect(search.loadError.value).toBe('')
    expect(loadAccountsSpy).toHaveBeenCalledTimes(1)
    expect(loadRecurrentsSpy).toHaveBeenCalledTimes(1)
    expect(loadPositionsSpy).toHaveBeenCalledTimes(1)
    expect(loadTransactionsSpy).toHaveBeenCalledTimes(2)
  })
})
