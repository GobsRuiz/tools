import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { resetMockApi } from '../helpers/mockApi'

describe('integration: recurrent flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('nao duplica no mesmo mes e cria no mes seguinte', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000 }],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const recurrent = {
      id: 'rec-1',
      accountId: 1,
      kind: 'expense',
      payment_method: 'debit',
      notify: true,
      name: 'Aluguel',
      amount_cents: -20000,
      frequency: 'monthly',
      due_day: 10,
      day_of_month: undefined,
      description: 'Aluguel mensal',
      active: true,
    } as any

    const first = await transactionsStore.payRecurrent(recurrent, '2026-03')
    const duplicate = await transactionsStore.payRecurrent(recurrent, '2026-03')
    const secondMonth = await transactionsStore.payRecurrent(recurrent, '2026-04')

    expect(duplicate.id).toBe(first.id)
    expect(secondMonth.id).not.toBe(first.id)
    expect(transactionsStore.transactions).toHaveLength(2)
  })
})
