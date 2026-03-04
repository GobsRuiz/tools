import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { resetMockApi } from '../helpers/mockApi'

describe('integration: credit invoice flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('compra no credito no dia de fechamento entra no ciclo seguinte e muda de open para paid ao pagar', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 100000, card_closing_day: 8, card_due_day: 15 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const tx = await transactionsStore.addTransaction({
      accountId: 1,
      date: '2026-03-08',
      type: 'expense',
      payment_method: 'credit',
      amount_cents: -5000,
      description: 'Compra cartao no fechamento',
      installment: null,
    } as any)

    const openMarch = transactionsStore.creditInvoicesByAccount('2026-03', 'open')
    const openApril = transactionsStore.creditInvoicesByAccount('2026-04', 'open')

    expect(openMarch.get(1) ?? []).toHaveLength(0)
    expect(openApril.get(1)?.map(item => item.id)).toEqual([tx.id])
    expect(accountsStore.accounts[0]?.balance_cents).toBe(100000)

    await transactionsStore.markPaid(tx.id)

    const openAfterPay = transactionsStore.creditInvoicesByAccount('2026-04', 'open')
    const paidAfterPay = transactionsStore.creditInvoicesByAccount('2026-04', 'paid')

    expect(openAfterPay.get(1) ?? []).toHaveLength(0)
    expect(paidAfterPay.get(1)?.map(item => item.id)).toEqual([tx.id])
    expect(accountsStore.accounts[0]?.balance_cents).toBe(95000)
  })

  it('payRecurrent em credito cria pendente sem alterar saldo, e pagamento posterior ajusta saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 50000, card_closing_day: 8, card_due_day: 15 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const recurrent = {
      id: 'rec-credit-1',
      accountId: 1,
      kind: 'expense',
      payment_method: 'credit',
      notify: true,
      name: 'Assinatura anual',
      amount_cents: -8000,
      frequency: 'monthly',
      due_day: 10,
      day_of_month: undefined,
      description: 'Plano premium',
      active: true,
    } as any

    const created = await transactionsStore.payRecurrent(recurrent, '2026-03')
    expect(created.paid).toBe(false)
    expect(created.payment_method).toBe('credit')
    expect(accountsStore.accounts[0]?.balance_cents).toBe(50000)

    await transactionsStore.markPaid(created.id)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(42000)
  })

  it('payRecurrent limita due_day ao ultimo dia do mes', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 30000 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()

    await accountsStore.loadAccounts()
    await transactionsStore.loadTransactions()

    const recurrent = {
      id: 'rec-day-clamp',
      accountId: 1,
      kind: 'expense',
      payment_method: 'debit',
      notify: true,
      name: 'Mensalidade',
      amount_cents: -1000,
      frequency: 'monthly',
      due_day: 31,
      day_of_month: undefined,
      description: 'Teste clamp',
      active: true,
    } as any

    const tx = await transactionsStore.payRecurrent(recurrent, '2026-02')
    expect(tx.date).toBe('2026-02-28')
  })
})
