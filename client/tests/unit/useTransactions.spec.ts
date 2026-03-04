import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { apiDeleteMock, getMockDb, resetMockApi } from '../helpers/mockApi'

describe('useTransactionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('markPaid e markUnpaid ajustam saldo da conta', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 },
      ],
      transactions: [
        {
          id: 'tx-1',
          accountId: 1,
          date: '2026-02-20',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -500,
          description: 'Cafe',
          paid: false,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'tx-1',
        accountId: 1,
        date: '2026-02-20',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -500,
        description: 'Cafe',
        paid: false,
        installment: null,
        createdAt: '2026-02-20',
      } as any,
    ]

    await transactionsStore.markPaid('tx-1')
    expect(transactionsStore.transactions[0]?.paid).toBe(true)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(9500)

    await transactionsStore.markUnpaid('tx-1')
    expect(transactionsStore.transactions[0]?.paid).toBe(false)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(10000)
  })

  it('markPaid e markUnpaid em transferencia ajustam origem e destino', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Origem', bank: 'Banco X', balance_cents: 10000 },
        { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 5000 },
      ],
      transactions: [
        {
          id: 'tx-transfer-1',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-02-20',
          type: 'transfer',
          payment_method: 'debit',
          amount_cents: -2000,
          description: 'Transferencia interna',
          paid: false,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Origem', bank: 'Banco X', balance_cents: 10000 } as any,
      { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 5000 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await transactionsStore.markPaid('tx-transfer-1')
    expect(transactionsStore.transactions[0]?.paid).toBe(true)
    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(8000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(7000)

    await transactionsStore.markUnpaid('tx-transfer-1')
    expect(transactionsStore.transactions[0]?.paid).toBe(false)
    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(10000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(5000)
  })

  it('updateTransaction recompõe saldos corretamente ao editar transferencia paga', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Origem A', bank: 'Banco X', balance_cents: 10000 },
        { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 5000 },
        { id: 3, label: 'Conta Origem B', bank: 'Banco Z', balance_cents: 2000 },
      ],
      transactions: [
        {
          id: 'tx-transfer-edit',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-02-20',
          type: 'transfer',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Transferencia original',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Origem A', bank: 'Banco X', balance_cents: 10000 } as any,
      { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 5000 } as any,
      { id: 3, label: 'Conta Origem B', bank: 'Banco Z', balance_cents: 2000 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await transactionsStore.updateTransaction('tx-transfer-edit', {
      accountId: 3,
      destinationAccountId: 2,
      amount_cents: -1500,
      description: 'Transferencia editada',
    })

    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(11000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(5500)
    expect(accountsStore.accounts.find(a => a.id === 3)?.balance_cents).toBe(500)
  })

  it('updateTransaction alterna paid sem perder consistencia de saldo', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 }],
      transactions: [
        {
          id: 'tx-paid-switch',
          accountId: 1,
          date: '2026-02-20',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -700,
          description: 'Despesa',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await transactionsStore.updateTransaction('tx-paid-switch', { paid: false })
    expect(accountsStore.accounts[0]?.balance_cents).toBe(10700)

    await transactionsStore.updateTransaction('tx-paid-switch', { paid: true })
    expect(accountsStore.accounts[0]?.balance_cents).toBe(10000)
  })

  it('evita ajuste duplicado em markPaid com chamadas concorrentes', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 }],
      transactions: [{
        id: 'tx-1',
        accountId: 1,
        date: '2026-02-20',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -500,
        description: 'Cafe',
        paid: false,
        installment: null,
        createdAt: '2026-02-20',
      }],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any]
    const adjustSpy = vi.spyOn(accountsStore, 'adjustBalance').mockImplementation(async (accountId, delta) => {
      const account = accountsStore.accounts.find(item => item.id === accountId)
      if (account) account.balance_cents += delta
    })

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await Promise.all([
      transactionsStore.markPaid('tx-1'),
      transactionsStore.markPaid('tx-1'),
    ])

    expect(adjustSpy).toHaveBeenCalledTimes(1)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(9500)
  })

  it('markPaid faz rollback do paid quando ajuste de saldo falha', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 }],
      transactions: [{
        id: 'tx-1',
        accountId: 1,
        date: '2026-02-20',
        type: 'expense',
        payment_method: 'debit',
        amount_cents: -500,
        description: 'Cafe',
        paid: false,
        installment: null,
        createdAt: '2026-02-20',
      }],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any]
    vi.spyOn(accountsStore, 'adjustBalance').mockRejectedValueOnce(new Error('falha ajuste'))

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await expect(transactionsStore.markPaid('tx-1')).rejects.toThrow('falha ajuste')
    expect(transactionsStore.transactions[0]?.paid).toBe(false)
    expect(getMockDb().transactions[0]?.paid).toBe(false)
  })

  it('bloqueia criacao de transacao de credito com conta sem cartao completo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta sem vencimento', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta sem vencimento', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8 } as any,
    ]

    const transactionsStore = useTransactionsStore()

    await expect(transactionsStore.addTransaction({
      accountId: 1,
      date: '2026-02-20',
      type: 'expense',
      payment_method: 'credit',
      amount_cents: -1000,
      description: 'Compra no credito',
      paid: false,
      installment: null,
    } as any)).rejects.toThrow('Para cartão de crédito, informe o dia de fechamento e o dia de vencimento juntos.')
  })

  describe('validacao de regras de negocio da transacao', () => {
    beforeEach(() => {
      resetMockApi({
        accounts: [
          { id: 1, label: 'Conta A', bank: 'Banco X', balance_cents: 10000 },
          { id: 2, label: 'Conta B', bank: 'Banco Y', balance_cents: 5000 },
        ],
        transactions: [],
        history: [],
      })
    })

    it('bloqueia transferencia sem conta de destino', async () => {
      const transactionsStore = useTransactionsStore()

      await expect(transactionsStore.addTransaction({
        accountId: 1,
        date: '2026-02-20',
        type: 'transfer',
        payment_method: undefined,
        amount_cents: -1000,
        description: 'Transferencia invalida',
        paid: true,
        installment: null,
      } as any)).rejects.toThrow('Transferencia exige conta de destino.')
    })

    it('bloqueia transferencia com mesma origem e destino', async () => {
      const transactionsStore = useTransactionsStore()

      await expect(transactionsStore.addTransaction({
        accountId: 1,
        destinationAccountId: 1,
        date: '2026-02-20',
        type: 'transfer',
        payment_method: undefined,
        amount_cents: -1000,
        description: 'Transferencia invalida',
        paid: true,
        installment: null,
      } as any)).rejects.toThrow('Conta de destino deve ser diferente da conta de origem.')
    })

    it('bloqueia receita com metodo de pagamento', async () => {
      const transactionsStore = useTransactionsStore()

      await expect(transactionsStore.addTransaction({
        accountId: 1,
        date: '2026-02-20',
        type: 'income',
        payment_method: 'credit',
        amount_cents: 1000,
        description: 'Receita invalida',
        paid: true,
        installment: null,
      } as any)).rejects.toThrow('Receita nao deve informar metodo de pagamento.')
    })

    it('bloqueia update que torna despesa com valor positivo', async () => {
      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = [
        {
          id: 'tx-expense',
          accountId: 1,
          date: '2026-02-20',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -500,
          description: 'Despesa valida',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        } as any,
      ]

      await expect(transactionsStore.updateTransaction('tx-expense', {
        amount_cents: 500,
      })).rejects.toThrow('Despesa deve ter valor negativo.')
    })

    it('bloqueia update que invalida transferencia removendo conta destino', async () => {
      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = [
        {
          id: 'tx-transfer',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-02-20',
          type: 'transfer',
          payment_method: undefined,
          amount_cents: -500,
          description: 'Transferencia valida',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        } as any,
      ]

      await expect(transactionsStore.updateTransaction('tx-transfer', {
        destinationAccountId: undefined,
      } as any)).rejects.toThrow('Transferencia exige conta de destino.')
    })
  })

  it('deleteInstallmentGroup remove grupo completo, reporta progresso e estorna saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 },
      ],
      transactions: [
        {
          id: 'inst-1',
          accountId: 1,
          date: '2026-01-10',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Notebook',
          paid: true,
          installment: { parentId: 'grp-1', total: 3, index: 1, product: 'Notebook' },
          createdAt: '2026-01-10',
        },
        {
          id: 'inst-2',
          accountId: 1,
          date: '2026-02-10',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Notebook',
          paid: true,
          installment: { parentId: 'grp-1', total: 3, index: 2, product: 'Notebook' },
          createdAt: '2026-02-10',
        },
        {
          id: 'inst-3',
          accountId: 1,
          date: '2026-03-10',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Notebook',
          paid: true,
          installment: { parentId: 'grp-1', total: 3, index: 3, product: 'Notebook' },
          createdAt: '2026-03-10',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    const progress: Array<[number, number]> = []
    await transactionsStore.deleteInstallmentGroup('grp-1', (current, total) => {
      progress.push([current, total])
    })

    expect(progress).toEqual([[1, 3], [2, 3], [3, 3]])
    expect(transactionsStore.transactions).toEqual([])
    expect(getMockDb().transactions).toEqual([])
    expect(accountsStore.accounts[0]?.balance_cents).toBe(13000)
  })

  it('deleteInstallmentGroup faz rollback quando ocorre falha parcial no delete', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 }],
      transactions: [
        {
          id: 'inst-1',
          accountId: 1,
          date: '2026-01-10',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Notebook',
          paid: true,
          installment: { parentId: 'grp-1', total: 2, index: 1, product: 'Notebook' },
          createdAt: '2026-01-10',
        },
        {
          id: 'inst-2',
          accountId: 1,
          date: '2026-02-10',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          description: 'Notebook',
          paid: true,
          installment: { parentId: 'grp-1', total: 2, index: 2, product: 'Notebook' },
          createdAt: '2026-02-10',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [{ id: 1, label: 'Conta Principal', bank: 'Banco X', balance_cents: 10000 } as any]
    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    const originalDelete = apiDeleteMock.getMockImplementation()
    apiDeleteMock
      .mockImplementationOnce(async (path: string) => originalDelete?.(path) as any)
      .mockImplementationOnce(async () => { throw new Error('falha parcial') })

    await expect(transactionsStore.deleteInstallmentGroup('grp-1')).rejects.toThrow('Falha ao excluir todas as parcelas do grupo.')
    expect(transactionsStore.transactions).toHaveLength(2)
    expect(getMockDb().transactions).toHaveLength(2)
    expect(accountsStore.accounts[0]?.balance_cents).toBe(10000)
  })

  it('getInstallmentGroupTotalCents soma valor real das parcelas com ajuste de arredondamento', () => {
    resetMockApi()

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'inst-1',
        accountId: 1,
        date: '2026-01-10',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -3333,
        description: 'Compra parcelada',
        paid: false,
        installment: { parentId: 'grp-round', total: 3, index: 1, product: 'Produto X' },
        createdAt: '2026-01-10',
      } as any,
      {
        id: 'inst-2',
        accountId: 1,
        date: '2026-02-10',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -3333,
        description: 'Compra parcelada',
        paid: false,
        installment: { parentId: 'grp-round', total: 3, index: 2, product: 'Produto X' },
        createdAt: '2026-02-10',
      } as any,
      {
        id: 'inst-3',
        accountId: 1,
        date: '2026-03-10',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -3334,
        description: 'Compra parcelada',
        paid: false,
        installment: { parentId: 'grp-round', total: 3, index: 3, product: 'Produto X' },
        createdAt: '2026-03-10',
      } as any,
      {
        id: 'other-tx',
        accountId: 1,
        date: '2026-03-15',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -9999,
        description: 'Outro grupo',
        paid: false,
        installment: { parentId: 'grp-other', total: 1, index: 1, product: 'Outro' },
        createdAt: '2026-03-15',
      } as any,
    ]

    expect(transactionsStore.getInstallmentGroupTotalCents('grp-round')).toBe(-10000)
    expect(transactionsStore.getInstallmentGroupTotalCents('grp-other')).toBe(-9999)
    expect(transactionsStore.getInstallmentGroupTotalCents('grp-missing')).toBe(0)
  })

  it('bloqueia exclusao de grupo quando houver parcela de credito paga', async () => {
    resetMockApi()

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = [
      {
        id: 'credit-paid-1',
        accountId: 1,
        date: '2026-01-01',
        type: 'expense',
        payment_method: 'credit',
        amount_cents: -1000,
        description: 'Compra cartao',
        paid: true,
        installment: { parentId: 'grp-credit', total: 2, index: 1, product: 'Cartao' },
        createdAt: '2026-01-01',
      } as any,
    ]

    await expect(transactionsStore.deleteInstallmentGroup('grp-credit')).rejects.toThrow(
      'O grupo possui parcela de credito ja paga e nao pode ser excluido.',
    )
  })

  it('bloqueia generateInstallments quando combinacao gera inversao de sinal na ultima parcela', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 100000 }],
      transactions: [],
      history: [],
    })

    const transactionsStore = useTransactionsStore()

    await expect(transactionsStore.generateInstallments({
      accountId: 1,
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'debit',
      totalAmountCents: -10000,
      installmentAmountCents: -7000,
      description: 'Compra invalida',
      product: 'Notebook',
      totalInstallments: 3,
    })).rejects.toThrow('Combinacao de total, quantidade e valor da parcela invalida.')
  })

  it('generateInstallments em debito aplica arredondamento na ultima e ajusta apenas primeira parcela no saldo', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 10000 }],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 10000 } as any]

    const transactionsStore = useTransactionsStore()
    const created = await transactionsStore.generateInstallments({
      accountId: 1,
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'debit',
      totalAmountCents: -10000,
      installmentAmountCents: -3333,
      description: 'Compra parcelada',
      product: 'Produto',
      totalInstallments: 3,
    })

    expect(created).toHaveLength(3)
    expect(created.map(tx => tx.amount_cents)).toEqual([-3333, -3333, -3334])
    expect(created.map(tx => tx.paid)).toEqual([true, false, false])
    expect(accountsStore.accounts[0]?.balance_cents).toBe(6667)
  })

  it('generateInstallments em credito cria todas pendentes e nao mexe no saldo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8, card_due_day: 15 },
      ],
      transactions: [],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8, card_due_day: 15 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    const created = await transactionsStore.generateInstallments({
      accountId: 1,
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'credit',
      totalAmountCents: -9000,
      installmentAmountCents: -3000,
      description: 'Compra credito',
      product: 'Produto Cartao',
      totalInstallments: 3,
    })

    expect(created.map(tx => tx.paid)).toEqual([false, false, false])
    expect(accountsStore.accounts[0]?.balance_cents).toBe(10000)
  })

  describe('creditInvoicesByAccount', () => {
    // Conta com closing_day=3: compras antes do dia 3 caem no ciclo do proprio mes.
    // tx-unpaid: date='2026-02-01' → ciclo '2026-02', paid=false
    // tx-paid:   date='2026-02-02' → ciclo '2026-02', paid=true
    // tx-next:   date='2026-02-05' → ciclo '2026-03' (apos fechamento dia 3), nao deve aparecer em '2026-02'
    // tx-nodueday: conta sem card_due_day, deve ser excluida

    beforeEach(() => {
      resetMockApi({
        accounts: [
          { id: 1, label: 'Cartao A', bank: 'Banco X', balance_cents: 0, card_due_day: 28, card_closing_day: 3 },
          { id: 2, label: 'Sem Due Day', bank: 'Banco Y', balance_cents: 0 },
        ],
        transactions: [],
        history: [],
      })
    })

    it('agrupa transacoes de credito pelo mes do ciclo correto', () => {
      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Cartao A', bank: 'Banco X', balance_cents: 0, card_due_day: 28, card_closing_day: 3 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = [
        {
          id: 'tx-feb1',
          accountId: 1,
          date: '2026-02-01',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -5000,
          description: 'Compra fev ciclo',
          paid: false,
          installment: null,
          createdAt: '2026-02-01',
        } as any,
        {
          id: 'tx-mar-ciclo',
          accountId: 1,
          date: '2026-02-05',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -3000,
          description: 'Compra apos fechamento dia 3 -> ciclo marco',
          paid: false,
          installment: null,
          createdAt: '2026-02-05',
        } as any,
      ]

      const grouped = transactionsStore.creditInvoicesByAccount('2026-02')
      const acc1Txs = grouped.get(1)

      expect(acc1Txs).toHaveLength(1)
      expect(acc1Txs?.[0]?.id).toBe('tx-feb1')
    })

    it('status open exclui pagas e status paid exclui pendentes', () => {
      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Cartao A', bank: 'Banco X', balance_cents: 0, card_due_day: 28, card_closing_day: 3 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = [
        {
          id: 'tx-unpaid',
          accountId: 1,
          date: '2026-02-01',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -5000,
          description: 'Pendente',
          paid: false,
          installment: null,
          createdAt: '2026-02-01',
        } as any,
        {
          id: 'tx-paid',
          accountId: 1,
          date: '2026-02-02',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -3000,
          description: 'Paga',
          paid: true,
          installment: null,
          createdAt: '2026-02-02',
        } as any,
      ]

      const all = transactionsStore.creditInvoicesByAccount('2026-02', 'all')
      expect(all.get(1)).toHaveLength(2)

      const open = transactionsStore.creditInvoicesByAccount('2026-02', 'open')
      const openTxs = open.get(1)
      expect(openTxs).toHaveLength(1)
      expect(openTxs?.[0]?.id).toBe('tx-unpaid')

      const paid = transactionsStore.creditInvoicesByAccount('2026-02', 'paid')
      const paidTxs = paid.get(1)
      expect(paidTxs).toHaveLength(1)
      expect(paidTxs?.[0]?.id).toBe('tx-paid')
    })

    it('exclui contas sem configuracao completa de cartao', () => {
      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 2, label: 'Sem Due Day', bank: 'Banco Y', balance_cents: 0 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = [
        {
          id: 'tx-nodueday',
          accountId: 2,
          date: '2026-02-10',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -2000,
          description: 'Sem fatura',
          paid: false,
          installment: null,
          createdAt: '2026-02-10',
        } as any,
      ]

      const grouped = transactionsStore.creditInvoicesByAccount('2026-02')
      expect(grouped.size).toBe(0)
    })
  })

  describe('payRecurrent', () => {
    it('recorrente de debito cria transacao paga e ajusta saldo', async () => {
      resetMockApi({
        accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 8, card_due_day: 15 }],
        transactions: [],
        history: [],
      })

      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 8, card_due_day: 15 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = []

      const rec = {
        id: 'rec-debit',
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

      const tx = await transactionsStore.payRecurrent(rec, '2026-02')

      expect(tx.paid).toBe(true)
      expect(tx.payment_method).toBe('debit')
      expect(accountsStore.accounts[0]?.balance_cents).toBe(30000)
    })

    it('payRecurrent remove transacao criada quando ajuste de saldo falha', async () => {
      resetMockApi({
        accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000 }],
        transactions: [],
        history: [],
      })

      const accountsStore = useAccountsStore()
      accountsStore.accounts = [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000 } as any]
      vi.spyOn(accountsStore, 'adjustBalance').mockRejectedValueOnce(new Error('falha ajuste'))

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = []

      const rec = {
        id: 'rec-debit',
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

      await expect(transactionsStore.payRecurrent(rec, '2026-02')).rejects.toThrow('falha ajuste')
      expect(transactionsStore.transactions).toHaveLength(0)
      expect(getMockDb().transactions).toHaveLength(0)
    })

    it('recorrente de credito cria transacao nao paga e nao ajusta saldo', async () => {
      resetMockApi({
        accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 8, card_due_day: 15 }],
        transactions: [],
        history: [],
      })

      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 8, card_due_day: 15 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = []

      const rec = {
        id: 'rec-credit',
        accountId: 1,
        kind: 'expense',
        payment_method: 'credit',
        notify: true,
        name: 'Streaming',
        amount_cents: -5000,
        frequency: 'monthly',
        due_day: 15,
        day_of_month: undefined,
        description: 'Netflix',
        active: true,
      } as any

      const tx = await transactionsStore.payRecurrent(rec, '2026-02')

      expect(tx.paid).toBe(false)
      expect(tx.payment_method).toBe('credit')
      expect(accountsStore.accounts[0]?.balance_cents).toBe(50000)
    })

    it('bloqueia recorrente de credito com conta sem cartao completo', async () => {
      resetMockApi({
        accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 10 }],
        transactions: [],
        history: [],
      })

      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000, card_closing_day: 10 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = []

      const rec = {
        id: 'rec-credit-invalid',
        accountId: 1,
        kind: 'expense',
        payment_method: 'credit',
        notify: true,
        name: 'Assinatura',
        amount_cents: -5000,
        frequency: 'monthly',
        due_day: 15,
        day_of_month: undefined,
        description: 'Streaming',
        active: true,
      } as any

      await expect(transactionsStore.payRecurrent(rec, '2026-02')).rejects.toThrow(
        'Para cartão de crédito, informe o dia de fechamento e o dia de vencimento juntos.',
      )
    })

    it('segunda chamada com mesmo recorrente e mes retorna transacao existente sem duplicar', async () => {
      resetMockApi({
        accounts: [{ id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000 }],
        transactions: [],
        history: [],
      })

      const accountsStore = useAccountsStore()
      accountsStore.accounts = [
        { id: 1, label: 'Conta', bank: 'Banco X', balance_cents: 50000 } as any,
      ]

      const transactionsStore = useTransactionsStore()
      transactionsStore.transactions = []

      const rec = {
        id: 'rec-debit',
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

      const first = await transactionsStore.payRecurrent(rec, '2026-02')
      const second = await transactionsStore.payRecurrent(rec, '2026-02')

      expect(second.id).toBe(first.id)
      expect(transactionsStore.transactions).toHaveLength(1)
      // Saldo deve ter sido ajustado apenas uma vez
      expect(accountsStore.accounts[0]?.balance_cents).toBe(30000)
    })
  })

  it('deleteTransaction estorna transferencia paga nas duas contas', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Origem', bank: 'Banco X', balance_cents: 8000 },
        { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 7000 },
      ],
      transactions: [
        {
          id: 'tx-transfer-delete',
          accountId: 1,
          destinationAccountId: 2,
          date: '2026-02-20',
          type: 'transfer',
          payment_method: 'debit',
          amount_cents: -2000,
          description: 'Transferencia paga',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
      history: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Origem', bank: 'Banco X', balance_cents: 8000 } as any,
      { id: 2, label: 'Conta Destino', bank: 'Banco Y', balance_cents: 7000 } as any,
    ]

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await transactionsStore.deleteTransaction('tx-transfer-delete')

    expect(transactionsStore.transactions).toHaveLength(0)
    expect(accountsStore.accounts.find(a => a.id === 1)?.balance_cents).toBe(10000)
    expect(accountsStore.accounts.find(a => a.id === 2)?.balance_cents).toBe(5000)
  })

  it('deleteTransaction bloqueia exclusao de compra de credito ja paga', async () => {
    resetMockApi({
      transactions: [
        {
          id: 'tx-credit-paid',
          accountId: 1,
          date: '2026-02-20',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -1000,
          description: 'Compra no cartao',
          paid: true,
          installment: null,
          createdAt: '2026-02-20',
        },
      ],
    })

    const transactionsStore = useTransactionsStore()
    transactionsStore.transactions = cloneTransactions(getMockDb().transactions)

    await expect(transactionsStore.deleteTransaction('tx-credit-paid')).rejects.toThrow(
      'Transacoes de credito pagas nao podem ser excluidas.',
    )
  })
})

function cloneTransactions<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}
