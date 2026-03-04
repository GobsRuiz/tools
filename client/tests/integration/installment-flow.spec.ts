import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { resetMockApi } from '../helpers/mockApi'

describe('integration: installment flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('gera 3 parcelas no credito todas como pendentes e sem ajuste imediato de saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Cartao', bank: 'Banco X', balance_cents: 100000, card_closing_day: 8, card_due_day: 15 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()

    const created = await transactionsStore.generateInstallments({
      accountId: 1,
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'credit',
      totalAmountCents: -10000,
      installmentAmountCents: -3333,
      product: 'Produto X',
      totalInstallments: 3,
    })

    expect(created).toHaveLength(3)
    expect(created.every(tx => tx.paid === false)).toBe(true)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(100000)
    expect(created.map(tx => tx.amount_cents)).toEqual([-3333, -3333, -3334])
  })

  it('gera 3 parcelas no debito com ajuste de saldo apenas na primeira parcela', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 100000 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()

    const created = await transactionsStore.generateInstallments({
      accountId: 1,
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'debit',
      totalAmountCents: -9000,
      installmentAmountCents: -3000,
      product: 'Produto Debito',
      totalInstallments: 3,
    })

    expect(created).toHaveLength(3)
    expect(created[0]?.paid).toBe(true)
    expect(created[1]?.paid).toBe(false)
    expect(created[2]?.paid).toBe(false)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(97000)
  })
})
