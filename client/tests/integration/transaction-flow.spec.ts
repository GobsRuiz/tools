import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { resetMockApi } from '../helpers/mockApi'

describe('integration: fluxo de transacoes com stores reais', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('fluxo completo: criar despesa paga, editar valor e excluir com reversao de saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 100000 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const created = await transactionsStore.addTransaction({
      accountId: 1,
      date: '2026-02-10',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -10000,
      description: 'Mercado',
      paid: true,
      installment: null,
    } as any)

    await accountsStore.adjustBalance(1, created.amount_cents, 'Mercado')
    expect(accountsStore.accounts[0]?.balance_cents).toBe(90000)

    await transactionsStore.updateTransaction(created.id, { amount_cents: -12000 })
    expect(accountsStore.accounts[0]?.balance_cents).toBe(88000)

    await transactionsStore.deleteTransaction(created.id)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(100000)
    expect(transactionsStore.transactions).toHaveLength(0)
  })

  it('fluxo de transferencia: exclusao reverte origem e destino', async () => {
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

  it('bloqueia payload invalido de transferencia sem conta de destino', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Origem', bank: 'Banco A', balance_cents: 100000 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    await expect(transactionsStore.addTransaction({
      accountId: 1,
      date: '2026-02-15',
      type: 'transfer',
      payment_method: undefined,
      amount_cents: -5000,
      description: 'Transferencia invalida',
      paid: true,
      installment: null,
    } as any)).rejects.toThrow('Transferencia exige conta de destino.')
  })
})
