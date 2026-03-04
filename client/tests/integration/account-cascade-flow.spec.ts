import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { apiDeleteMock, getMockDb, resetMockApi } from '../helpers/mockApi'

describe('integration: account cascade flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('falha intermediaria na cascata restaura snapshot e mantem base consistente', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Remover', bank: 'Banco A', balance_cents: 1000 },
        { id: 2, label: 'Conta Manter', bank: 'Banco B', balance_cents: 5000 },
      ],
      transactions: [
        { id: 'tx-1', accountId: 1, type: 'expense', amount_cents: -200, paid: true, date: '2026-03-01' },
      ],
      recurrents: [{ id: 'rec-1', accountId: 1, kind: 'expense', amount_cents: -1000, frequency: 'monthly', active: true }],
      investment_positions: [{ id: 'pos-1', accountId: 1, bucket: 'variable', investment_type: 'fii', asset_code: 'HGLG11', is_active: true, invested_cents: 0 }],
      investment_events: [{ id: 'evt-1', accountId: 1, positionId: 'pos-1', date: '2026-03-01', event_type: 'buy', amount_cents: 1000 }],
    })

    const store = useAccountsStore()
    await store.loadAccounts()
    const dbBefore = JSON.parse(JSON.stringify(getMockDb()))

    const originalDelete = apiDeleteMock.getMockImplementation()
    apiDeleteMock
      .mockImplementationOnce(async (path: string) => originalDelete?.(path) as any)
      .mockImplementationOnce(async () => { throw new Error('falha durante cascata') })

    await expect(store.deleteAccount(1)).rejects.toMatchObject({
      stage: 'delete_account_cascade',
      rollbackApplied: true,
    })

    expect(getMockDb()).toEqual(dbBefore)
    expect(store.accounts.map(item => item.id).sort()).toEqual([1, 2])
  })
})
