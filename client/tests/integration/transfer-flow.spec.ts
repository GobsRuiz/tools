import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { resetMockApi } from '../helpers/mockApi'

describe('integration: transfer flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('nova transferencia impacta origem e destino; exclusao reverte ambos', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Origem', bank: 'Banco A', balance_cents: 100000 },
        { id: 2, label: 'Destino', bank: 'Banco B', balance_cents: 20000 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const transfer = await transactionsStore.addTransaction({
      accountId: 1,
      destinationAccountId: 2,
      date: '2026-02-15',
      type: 'transfer',
      payment_method: undefined,
      amount_cents: -5000,
      description: 'Transferencia teste',
      paid: true,
      installment: null,
    } as any)

    await accountsStore.adjustBalance(1, -5000, 'Saida transferencia')
    await accountsStore.adjustBalance(2, 5000, 'Entrada transferencia')

    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(95000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(25000)

    await transactionsStore.deleteTransaction(transfer.id)

    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(100000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(20000)
  })
})
