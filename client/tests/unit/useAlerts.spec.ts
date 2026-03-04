import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useAlerts } from '~/composables/useAlerts'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'

describe('useAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-02-28T12:00:00'))
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('gera alerta de recorrente para a proxima ocorrencia mensal e evita atraso falso', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()

    accountsStore.accounts = [
      { id: 1, label: 'Conta Casa', bank: 'Banco X', balance_cents: 0 } as any,
    ]
    transactionsStore.transactions = []
    recurrentsStore.recurrents = [
      {
        id: 'rec-1',
        accountId: 1,
        kind: 'expense',
        payment_method: 'debit',
        notify: true,
        name: 'Aluguel',
        amount_cents: -250000,
        frequency: 'monthly',
        day_of_month: undefined,
        due_day: 1,
        description: 'Aluguel mensal',
        active: true,
      } as any,
    ]

    const { allAlerts, groupedAlerts } = useAlerts()

    expect(allAlerts.value).toHaveLength(1)
    expect(allAlerts.value[0]).toMatchObject({
      alertType: 'recurrent',
      bucket: 'next',
      targetDate: '2026-03-01',
      daysUntil: 1,
    })
    expect(groupedAlerts.value.overdue).toHaveLength(0)
  })

  describe('invoiceDueAlerts', () => {
    // Sistema: 2026-02-28. Conta: closing_day=3, due_day=28.
    // Compra '2026-02-02' (antes do dia 3) → ciclo fev → vencimento 2026-02-28 → 0 dias → 'today'
    it('gera alerta invoice_due no bucket today quando vencimento e hoje', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao A', bank: 'Banco X', balance_cents: 0, card_due_day: 28, card_closing_day: 3 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-1',
          accountId: 1,
          date: '2026-02-02',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -10000,
          description: 'Compra',
          paid: false,
          installment: null,
          createdAt: '2026-02-02',
        } as any,
      ]

      const { groupedAlerts } = useAlerts()

      expect(groupedAlerts.value.today).toHaveLength(1)
      expect(groupedAlerts.value.today[0]).toMatchObject({
        alertType: 'invoice_due',
        bucket: 'today',
        accountId: 1,
        targetDate: '2026-02-28',
        daysUntil: 0,
        amountCents: 10000,
      })
    })

    // Sistema: 2026-02-28. Conta: closing_day=3, due_day=1.
    // due_day(1) <= closing_day(3) → dueRef avanca um mes → '2026-03-01' → 1 dia → 'next'
    it('gera alerta invoice_due no bucket next quando vencimento e em 1 dia', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao B', bank: 'Banco X', balance_cents: 0, card_due_day: 1, card_closing_day: 3 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-2',
          accountId: 1,
          date: '2026-02-02',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -8000,
          description: 'Compra',
          paid: false,
          installment: null,
          createdAt: '2026-02-02',
        } as any,
      ]

      const { groupedAlerts } = useAlerts()

      expect(groupedAlerts.value.next).toHaveLength(1)
      expect(groupedAlerts.value.next[0]).toMatchObject({
        alertType: 'invoice_due',
        bucket: 'next',
        targetDate: '2026-03-01',
        daysUntil: 1,
      })
    })

    // Sistema: 2026-02-28. Conta: closing_day=3, due_day=26.
    // due_day(26) > closing_day(3) → dueRef = ciclo atual (fev) → '2026-02-26' → -2 dias → 'overdue'
    it('gera alerta invoice_due no bucket overdue quando vencimento ja passou', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao C', bank: 'Banco X', balance_cents: 0, card_due_day: 26, card_closing_day: 3 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-3',
          accountId: 1,
          date: '2026-02-02',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -6000,
          description: 'Compra',
          paid: false,
          installment: null,
          createdAt: '2026-02-02',
        } as any,
      ]

      const { groupedAlerts } = useAlerts()

      expect(groupedAlerts.value.overdue).toHaveLength(1)
      expect(groupedAlerts.value.overdue[0]).toMatchObject({
        alertType: 'invoice_due',
        bucket: 'overdue',
        targetDate: '2026-02-26',
        daysUntil: -2,
      })
    })

    it('nao gera invoice_due para transacoes ja pagas', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao D', bank: 'Banco X', balance_cents: 0, card_due_day: 28, card_closing_day: 3 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-4',
          accountId: 1,
          date: '2026-02-02',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -5000,
          description: 'Compra paga',
          paid: true,
          installment: null,
          createdAt: '2026-02-02',
        } as any,
      ]

      const { allAlerts } = useAlerts()

      expect(allAlerts.value.filter(a => a.alertType === 'invoice_due')).toHaveLength(0)
    })
  })

  describe('invoiceClosingAlerts', () => {
    it('ignora conta com configuracao de cartao incompleta', () => {
      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Incompleto', bank: 'Banco X', balance_cents: 0, card_closing_day: 28 } as any,
      ]

      const { allAlerts } = useAlerts()
      expect(allAlerts.value.filter(a => a.alertType === 'invoice_closing' || a.alertType === 'invoice_due')).toHaveLength(0)
    })

    it('gera alerta invoice_closing no bucket today quando fechamento e hoje', () => {
      // Sistema: 2026-02-28. Conta: closing_day=28 → targetDate='2026-02-28' → 0 dias → 'today'
      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao X', bank: 'Banco X', balance_cents: 0, card_closing_day: 28, card_due_day: 5 } as any,
      ]

      const { groupedAlerts } = useAlerts()

      expect(groupedAlerts.value.today).toHaveLength(1)
      expect(groupedAlerts.value.today[0]).toMatchObject({
        alertType: 'invoice_closing',
        bucket: 'today',
        targetDate: '2026-02-28',
        daysUntil: 0,
      })
    })

    it('gera alerta invoice_closing no bucket next quando fechamento em 2 dias', () => {
      // Ajusta sistema para 2026-02-26. Conta: closing_day=28 → targetDate='2026-02-28' → 2 dias → 'next'
      vi.setSystemTime(new Date('2026-02-26T12:00:00'))

      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Y', bank: 'Banco X', balance_cents: 0, card_closing_day: 28, card_due_day: 5 } as any,
      ]

      const { groupedAlerts } = useAlerts()

      expect(groupedAlerts.value.next).toHaveLength(1)
      expect(groupedAlerts.value.next[0]).toMatchObject({
        alertType: 'invoice_closing',
        bucket: 'next',
        targetDate: '2026-02-28',
        daysUntil: 2,
      })
    })


    it('projeta fechamento para a proxima ocorrencia mensal na virada de mes', () => {
      vi.setSystemTime(new Date('2026-02-27T12:00:00'))

      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Virada', bank: 'Banco X', balance_cents: 0, card_closing_day: 1, card_due_day: 10 } as any,
      ]

      const { groupedAlerts } = useAlerts()
      const closing = groupedAlerts.value.next.find(a => a.alertType === 'invoice_closing')

      expect(closing).toBeDefined()
      expect(closing).toMatchObject({
        bucket: 'next',
        targetDate: '2026-03-01',
        daysUntil: 2,
      })
    })

    it('aplica clamp de dia na proxima ocorrencia (dia 31 em mes de 30 dias)', () => {
      vi.setSystemTime(new Date('2026-04-29T12:00:00'))

      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Clamp30', bank: 'Banco X', balance_cents: 0, card_closing_day: 31, card_due_day: 10 } as any,
      ]

      const { groupedAlerts } = useAlerts()
      const closing = groupedAlerts.value.next.find(a => a.alertType === 'invoice_closing')

      expect(closing).toBeDefined()
      expect(closing).toMatchObject({
        bucket: 'next',
        targetDate: '2026-04-30',
        daysUntil: 1,
      })
    })

    it('aplica clamp de fevereiro na proxima ocorrencia (dia 31)', () => {
      vi.setSystemTime(new Date('2026-02-27T12:00:00'))

      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Fev', bank: 'Banco X', balance_cents: 0, card_closing_day: 31, card_due_day: 10 } as any,
      ]

      const { groupedAlerts } = useAlerts()
      const closing = groupedAlerts.value.next.find(a => a.alertType === 'invoice_closing')

      expect(closing).toBeDefined()
      expect(closing).toMatchObject({
        bucket: 'next',
        targetDate: '2026-02-28',
        daysUntil: 1,
      })
    })
    it('nao gera invoice_closing quando fechamento esta longe (>2 dias)', () => {
      // Sistema: 2026-02-28. Conta: closing_day=5 → targetDate='2026-02-05' está no passado,
      // mas dateForDayInCurrentMonth usa o mes atual → '2026-02-05' → -23 dias → toClosingBucket=-23 → null
      const accountsStore = useAccountsStore()
      useTransactionsStore().transactions = []
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Z', bank: 'Banco X', balance_cents: 0, card_closing_day: 5, card_due_day: 15 } as any,
      ]

      const { allAlerts } = useAlerts()

      expect(allAlerts.value.filter(a => a.alertType === 'invoice_closing')).toHaveLength(0)
    })

    it('inclui valor aberto no alerta invoice_closing quando ha transacoes de credito pendentes', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao W', bank: 'Banco X', balance_cents: 0, card_closing_day: 28, card_due_day: 5 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-open',
          accountId: 1,
          date: '2026-02-10',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -15000,
          description: 'Pendente',
          paid: false,
          installment: null,
          createdAt: '2026-02-10',
        } as any,
      ]

      const { groupedAlerts } = useAlerts()

      const closing = groupedAlerts.value.today.find(a => a.alertType === 'invoice_closing')
      expect(closing).toBeDefined()
      expect(closing?.amountCents).toBe(15000)
    })

    it('considera apenas o ciclo de referencia no valor do invoice_closing', () => {
      const accountsStore = useAccountsStore()
      const transactionsStore = useTransactionsStore()
      useRecurrentsStore().recurrents = []

      accountsStore.accounts = [
        { id: 1, label: 'Cartao Ciclo', bank: 'Banco X', balance_cents: 0, card_closing_day: 28, card_due_day: 5 } as any,
      ]
      transactionsStore.transactions = [
        {
          id: 'tx-cycle-current',
          accountId: 1,
          date: '2026-02-10',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -15000,
          paid: false,
          installment: null,
          createdAt: '2026-02-10',
        } as any,
        {
          id: 'tx-cycle-old',
          accountId: 1,
          date: '2026-01-10',
          type: 'expense',
          payment_method: 'credit',
          amount_cents: -8000,
          paid: false,
          installment: null,
          createdAt: '2026-01-10',
        } as any,
      ]

      const { groupedAlerts } = useAlerts()

      const closing = groupedAlerts.value.today.find(a => a.alertType === 'invoice_closing')
      expect(closing).toBeDefined()
      expect(closing?.amountCents).toBe(15000)
    })
  })
})

