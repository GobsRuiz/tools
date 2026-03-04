import { createPinia, setActivePinia } from 'pinia'
import { computed, ref } from 'vue'
import { beforeEach, describe, expect, it } from 'vitest'
import { useDashboardData } from '~/composables/useDashboardData'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'

vi.mock('~/composables/useAlerts', () => ({
  useAlerts: () => ({
    groupedAlerts: computed(() => ({
      overdue: [],
      today: [],
      next: [],
    })),
    counts: computed(() => ({
      overdue: 0,
      today: 0,
      next: 0,
      total: 0,
    })),
  }),
}))

describe('useDashboardData', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('calcula indicadores financeiros e pendencias do mes corretamente', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 100000, card_closing_day: 8, card_due_day: 15 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco', type: 'bank', balance_cents: 50000 } as any,
    ]

    transactionsStore.transactions = [
      { id: 'tx-1', accountId: 1, date: '2026-03-05', type: 'income', amount_cents: 20000, paid: true } as any,
      { id: 'tx-2', accountId: 1, date: '2026-03-06', type: 'expense', payment_method: 'debit', amount_cents: -12000, paid: false } as any,
      { id: 'tx-3', accountId: 1, date: '2026-03-07', type: 'expense', payment_method: 'credit', amount_cents: -3000, paid: false } as any,
      { id: 'tx-4', accountId: 1, date: '2026-03-09', type: 'transfer', amount_cents: -5000, paid: true, destinationAccountId: 2 } as any,
      { id: 'tx-5', accountId: 1, date: '2026-03-10', type: 'expense', payment_method: 'debit', amount_cents: -4000, paid: true, recurrentId: 'rec-paid' } as any,
      { id: 'tx-prev', accountId: 1, date: '2026-02-10', type: 'income', amount_cents: 10000, paid: true } as any,
    ]

    recurrentsStore.recurrents = [
      { id: 'rec-pending', accountId: 1, active: true, kind: 'expense', amount_cents: -7000 } as any,
      { id: 'rec-paid', accountId: 1, active: true, kind: 'expense', amount_cents: -4000 } as any,
    ]

    positionsStore.positions = [
      { id: 'pos-1', invested_cents: 25000 } as any,
    ]
    eventsStore.events = []

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    expect(dashboard.monthEntriesCents.value).toBe(20000)
    expect(dashboard.monthExpensesCents.value).toBe(19000)
    expect(dashboard.monthNetCents.value).toBe(1000)
    expect(dashboard.balanceTotalCents.value).toBe(150000)
    expect(dashboard.investedTotalCents.value).toBe(25000)

    expect(dashboard.openInvoiceCount.value).toBe(1)
    expect(dashboard.openInvoiceTotalCents.value).toBe(3000)
    expect(dashboard.unpaidDebitMonthCents.value).toBe(12000)
    expect(dashboard.recurringPendingExpenseCents.value).toBe(7000)
    expect(dashboard.pendingTotalCents.value).toBe(22000)
    expect(dashboard.pendingCount.value).toBe(3)
  })

  it('gera fluxo semanal e agregacoes com regras de apresentacao', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 100000 } as any]
    recurrentsStore.recurrents = []
    positionsStore.positions = []
    eventsStore.events = []
    transactionsStore.transactions = [
      { id: 'a', accountId: 1, date: '2026-03-01', type: 'income', amount_cents: 10000, paid: true } as any,
      { id: 'b', accountId: 1, date: '2026-03-03', type: 'expense', payment_method: 'debit', amount_cents: -4000, paid: true } as any,
      { id: 'c', accountId: 1, date: '2026-03-18', type: 'expense', payment_method: 'credit', amount_cents: -3000, paid: false } as any,
    ]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    expect(dashboard.flowByWeek.value.length).toBe(5)
    expect(dashboard.flowByWeek.value[0]).toMatchObject({
      label: 'S1',
      start: 1,
      end: 7,
      inCents: 10000,
      outCents: 4000,
      netCents: 6000,
    })
    expect(dashboard.flowBarHeight(0)).toBe('4%')
    expect(dashboard.flowBarHeight(1)).toBe('8%')
    expect(dashboard.flowTooltip(dashboard.flowByWeek.value[0]!)).toContain('S1 (1-7)')

    expect(dashboard.expenseByMethod.value).toEqual({
      credit: 3000,
      debit: 4000,
      other: 0,
      total: 7000,
    })
    expect(dashboard.transactionTypeBreakdown.value.total).toBe(17000)
    expect(dashboard.expensePaymentStatus.value).toMatchObject({
      paidCents: 4000,
      pendingCents: 3000,
    })
  })

  it('calcula evolucao de investimentos por periodo (mes/ano/todo)', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco', type: 'bank', balance_cents: 100000 } as any]
    transactionsStore.transactions = []
    recurrentsStore.recurrents = []
    positionsStore.positions = [{ id: 'pos-1', asset_code: 'AAA', invested_cents: 0 } as any]
    eventsStore.events = [
      { id: 'e-jan', positionId: 'pos-1', date: '2026-01-10', event_type: 'buy', amount_cents: 1000 } as any,
      { id: 'e-mar1', positionId: 'pos-1', date: '2026-03-01', event_type: 'buy', amount_cents: 1000 } as any,
      { id: 'e-mar2', positionId: 'pos-1', date: '2026-03-02', event_type: 'sell', amount_cents: 300 } as any,
      { id: 'e-mar3', positionId: 'pos-1', date: '2026-03-15', event_type: 'income', amount_cents: 200 } as any,
      { id: 'e-apr', positionId: 'pos-1', date: '2026-04-10', event_type: 'withdrawal', amount_cents: 100 } as any,
    ]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    expect(dashboard.investmentPeriodSummary.value.eventCount).toBe(3)
    expect(dashboard.investmentPeriodSummary.value.netCents).toBe(900)
    expect(dashboard.investmentEvolutionPoints.value).toHaveLength(31)
    expect(dashboard.investmentEvolutionPoints.value[30]?.valueCents).toBe(900)

    period.value = 'year'
    expect(dashboard.investmentEventsForPeriod.value).toHaveLength(5)
    expect(dashboard.investmentEvolutionPoints.value).toHaveLength(12)
    expect(dashboard.investmentEvolutionPoints.value[11]?.valueCents).toBe(1800)

    period.value = 'all'
    expect(dashboard.investmentEventsForPeriod.value).toHaveLength(5)
    expect(dashboard.investmentEvolutionPoints.value.length).toBeGreaterThanOrEqual(4)
    expect(dashboard.investmentEvolutionPoints.value.at(-1)?.valueCents).toBe(1800)
  })
})
