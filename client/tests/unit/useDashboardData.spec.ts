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

  it('investmentSummary calcula PnL, split por bucket e top posicoes', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Corretora', bank: 'B', type: 'bank', balance_cents: 0 } as any]
    transactionsStore.transactions = []
    recurrentsStore.recurrents = []
    eventsStore.events = []
    positionsStore.positions = [
      { id: 'p1', bucket: 'variable', asset_code: 'PETR4', invested_cents: 10000, current_value_cents: 13000 } as any,
      { id: 'p2', bucket: 'fixed', asset_code: 'CDB', invested_cents: 20000, current_value_cents: 21000, principal_cents: 20000 } as any,
      { id: 'p3', bucket: 'variable', asset_code: 'BOVA11', invested_cents: 5000, current_value_cents: 0 } as any,
    ]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)
    const summary = dashboard.investmentSummary.value

    expect(summary.totalInvestedCents).toBe(35000)
    expect(summary.totalCurrentCents).toBe(34000)
    expect(summary.totalPnlCents).toBe(-1000)
    expect(summary.fixedCurrentCents).toBe(21000)
    expect(summary.variableCurrentCents).toBe(13000)
    // p3 fica fora do topPositions pois current=0 e invested=5000 → fica incluida (investedCents>0)
    expect(summary.topPositions[0]?.label).toBe('CDB')
    expect(summary.topPositions[1]?.label).toBe('PETR4')
    // PnL por posicao
    expect(summary.topPositions[0]?.pnlCents).toBe(1000)
    expect(summary.topPositions[1]?.pnlCents).toBe(3000)
  })

  it('latestTransactions retorna no maximo 12 transacoes ordenadas por data desc', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta', bank: 'B', type: 'bank', balance_cents: 0 } as any]
    recurrentsStore.recurrents = []
    positionsStore.positions = []
    eventsStore.events = []

    transactionsStore.transactions = Array.from({ length: 15 }, (_, index) => ({
      id: `tx-${index + 1}`,
      accountId: 1,
      date: `2026-03-${String(index + 1).padStart(2, '0')}`,
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -(index + 1) * 100,
      paid: false,
      installment: null,
    })) as any

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    expect(dashboard.latestTransactions.value).toHaveLength(12)
    // ordenado por data desc → primeiro deve ser tx-15 (dia 15)
    expect(dashboard.latestTransactions.value[0]?.id).toBe('tx-15')
    expect(dashboard.latestTransactions.value[11]?.id).toBe('tx-4')
  })

  it('variacoes de entradas e despesas refletem diferenca em relacao ao mes anterior', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta', bank: 'B', type: 'bank', balance_cents: 0 } as any]
    recurrentsStore.recurrents = []
    positionsStore.positions = []
    eventsStore.events = []
    transactionsStore.transactions = [
      // Mes atual (marco)
      { id: 'cur-in', accountId: 1, date: '2026-03-05', type: 'income', amount_cents: 30000, paid: true } as any,
      { id: 'cur-out', accountId: 1, date: '2026-03-10', type: 'expense', payment_method: 'debit', amount_cents: -10000, paid: true } as any,
      // Mes anterior (fevereiro)
      { id: 'prev-in', accountId: 1, date: '2026-02-05', type: 'income', amount_cents: 20000, paid: true } as any,
      { id: 'prev-out', accountId: 1, date: '2026-02-10', type: 'expense', payment_method: 'debit', amount_cents: -15000, paid: true } as any,
    ]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    // Entradas: 30000 atual vs 20000 anterior → +50% → tone verde
    expect(dashboard.monthEntriesCents.value).toBe(30000)
    expect(dashboard.entriesVariation.value.tone).toBe('text-emerald-400')
    expect(dashboard.entriesVariation.value.label).toContain('+50.0%')

    // Despesas: 10000 atual vs 15000 anterior → -33.3% → invert=true → reducao e verde
    expect(dashboard.monthExpensesCents.value).toBe(10000)
    expect(dashboard.expensesVariation.value.tone).toBe('text-emerald-400')

    // Saldo liquido: 30000-10000 = 20000
    expect(dashboard.monthNetCents.value).toBe(20000)
  })

  it('transferencias sao excluidas dos calculos de entradas e despesas', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [
      { id: 1, label: 'Conta A', bank: 'B', type: 'bank', balance_cents: 0 } as any,
      { id: 2, label: 'Conta B', bank: 'B', type: 'bank', balance_cents: 0 } as any,
    ]
    recurrentsStore.recurrents = []
    positionsStore.positions = []
    eventsStore.events = []
    transactionsStore.transactions = [
      { id: 'income', accountId: 1, date: '2026-03-01', type: 'income', amount_cents: 10000, paid: true } as any,
      { id: 'transfer', accountId: 1, date: '2026-03-05', type: 'transfer', amount_cents: -5000, paid: true, destinationAccountId: 2 } as any,
    ]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    // entradas ignora transfer
    expect(dashboard.monthEntriesCents.value).toBe(10000)
    // despesas ignora transfer
    expect(dashboard.monthExpensesCents.value).toBe(0)
  })

  it('helpers de exibicao lidam com dados incompletos/legados sem quebrar', () => {
    const accountsStore = useAccountsStore()
    const transactionsStore = useTransactionsStore()
    const recurrentsStore = useRecurrentsStore()
    const positionsStore = useInvestmentPositionsStore()
    const eventsStore = useInvestmentEventsStore()

    accountsStore.accounts = [{ id: 1, label: 'Conta Principal', bank: 'Banco', type: 'bank', balance_cents: 10000 } as any]
    transactionsStore.transactions = [
      {
        id: 'tx-legacy',
        accountId: 1,
        date: '2026-03-05',
        type: 'expense',
        amount_cents: -1000,
        description: '',
        paid: false,
        installment: null,
      },
    ] as any
    recurrentsStore.recurrents = []
    positionsStore.positions = [{ id: 'pos-1', accountId: 1, asset_code: '', name: '', invested_cents: 0 } as any]
    eventsStore.events = [{ id: 'e-1', positionId: 'missing', date: '2026-03-05', event_type: 'sell', amount_cents: 500 } as any]

    const selectedMonth = ref('2026-03')
    const period = ref<'month' | 'year' | 'all'>('month')
    const dashboard = useDashboardData(selectedMonth, period)

    expect(dashboard.getAccountLabel(999)).toBe('Conta')
    expect(dashboard.investmentPositionLabel('missing')).toBe('Posicao')
    expect(dashboard.investmentEventTypeLabel('withdrawal')).toBe('Resgate')
    expect(dashboard.investmentEventAmountClass({ event_type: 'sell' } as any)).toBe('text-red-500')
    expect(dashboard.investmentEventSignedCents({ event_type: 'sell', amount_cents: 500 } as any)).toBe(-500)

    const tx = transactionsStore.transactions[0] as any
    expect(dashboard.txDisplayLabel(tx)).toBe('Transacao')
    expect(dashboard.txTypeLabel(tx)).toBe('Despesa')
    expect(dashboard.txDateLabel('invalid-date')).toBe('invalid-date')
    expect(dashboard.shortDateLabel('invalid-date')).toBe('invalid-date')
  })
})
