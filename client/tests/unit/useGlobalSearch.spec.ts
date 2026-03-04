import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
