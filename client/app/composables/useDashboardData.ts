import dayjs from 'dayjs'
import type { ChartData, ChartOptions, TooltipItem } from 'chart.js'
import { CreditCard, BellRing, ArrowUpRight, ArrowDownRight, Repeat } from 'lucide-vue-next'
import type { AlertBucket, AlertItem } from '~/composables/useAlerts'
import { useAlerts } from '~/composables/useAlerts'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'
import { monthKey } from '~/utils/dates'
import { buildVariation, percentOf } from '~/utils/dashboard-math'
import { formatCentsToBRL } from '~/utils/money'
import { isPendingDebitExpenseTransactionForMonth } from '~/utils/pending-transactions'

type DashboardTx = {
  id: string
  accountId: number
  date: string
  type: 'expense' | 'income' | 'transfer'
  payment_method?: 'debit' | 'credit'
  amount_cents: number
  description?: string
  paid: boolean
  recurrentId?: string
  installment?: { product: string; index: number; total: number } | null
}

type DashboardRecurrent = {
  id: string
  active: boolean
  kind: 'expense' | 'income'
  amount_cents: number
}

type DashboardPosition = {
  id: string
  bucket?: 'variable' | 'fixed'
  asset_code?: string
  name?: string
  invested_cents?: number
  current_value_cents?: number
  principal_cents?: number
}

type DashboardInvestmentEvent = {
  id: string
  positionId: string
  date: string
  event_type: 'buy' | 'sell' | 'income' | 'contribution' | 'withdrawal' | 'maturity'
  amount_cents: number
}

type WeeklyFlow = {
  label: string
  start: number
  end: number
  inCents: number
  outCents: number
  netCents: number
}

type InvestmentEvolutionPoint = {
  label: string
  valueCents: number
}

const monthFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const monthShortFormatter = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

const chartTickColor = '#a1a1aa'
const chartGridColor = 'rgba(161, 161, 170, 0.2)'
const chartLegendColor = '#d4d4d8'

export function useDashboardData(
  selectedMonth: Ref<string>,
  investmentPeriodTab: Ref<'month' | 'year' | 'all'>,
) {
  const accountsStore = useAccountsStore()
  const transactionsStore = useTransactionsStore()
  const recurrentsStore = useRecurrentsStore()
  const investmentPositionsStore = useInvestmentPositionsStore()
  const investmentEventsStore = useInvestmentEventsStore()
  const { groupedAlerts, counts } = useAlerts()

  // ── Month helpers ──

  function belongsToMonth(date: string, targetMonth: string): boolean {
    return monthKey(date) === targetMonth || (typeof date === 'string' && date.slice(0, 7) === targetMonth)
  }

  function formatMonthLabel(month: string): string {
    const [year, value] = month.split('-')
    const date = new Date(Number(year), Number(value) - 1, 1)
    const formatted = monthFormatter.format(date)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1)
  }

  const selectedMonthLabel = computed(() => formatMonthLabel(selectedMonth.value))

  function prevMonth() {
    selectedMonth.value = dayjs(`${selectedMonth.value}-01`).subtract(1, 'month').format('YYYY-MM')
  }

  function nextMonth() {
    selectedMonth.value = dayjs(`${selectedMonth.value}-01`).add(1, 'month').format('YYYY-MM')
  }

  // ── Financial computations ──

  function entriesForMonth(targetMonth: string): number {
    return (transactionsStore.transactions as DashboardTx[]).reduce((sum, tx) => {
      if (!belongsToMonth(tx.date, targetMonth)) return sum
      if (tx.type === 'transfer') return sum
      if (tx.amount_cents <= 0) return sum
      return sum + tx.amount_cents
    }, 0)
  }

  function expensesForMonth(targetMonth: string): number {
    return (transactionsStore.transactions as DashboardTx[]).reduce((sum, tx) => {
      if (!belongsToMonth(tx.date, targetMonth)) return sum
      if (tx.type === 'transfer') return sum
      if (tx.amount_cents >= 0) return sum
      return sum + Math.abs(tx.amount_cents)
    }, 0)
  }

  const monthTransactions = computed(() =>
    (transactionsStore.transactions as DashboardTx[]).filter(tx => belongsToMonth(tx.date, selectedMonth.value)),
  )

  const previousMonth = computed(() =>
    dayjs(`${selectedMonth.value}-01`).subtract(1, 'month').format('YYYY-MM'),
  )

  const monthEntriesCents = computed(() => entriesForMonth(selectedMonth.value))
  const monthExpensesCents = computed(() => expensesForMonth(selectedMonth.value))
  const previousMonthEntriesCents = computed(() => entriesForMonth(previousMonth.value))
  const previousMonthExpensesCents = computed(() => expensesForMonth(previousMonth.value))

  const entriesVariation = computed(() =>
    buildVariation(monthEntriesCents.value, previousMonthEntriesCents.value),
  )
  const expensesVariation = computed(() =>
    buildVariation(monthExpensesCents.value, previousMonthExpensesCents.value, true),
  )
  const monthNetCents = computed(() => monthEntriesCents.value - monthExpensesCents.value)
  const monthNetVariation = computed(() => {
    const previousNet = previousMonthEntriesCents.value - previousMonthExpensesCents.value
    return buildVariation(monthNetCents.value, previousNet)
  })

  const balanceTotalCents = computed(() =>
    accountsStore.accounts.reduce((sum: number, account: any) => sum + account.balance_cents, 0),
  )
  const investedTotalCents = computed(() =>
    investmentPositionsStore.positions.reduce((sum: number, p: any) => sum + (p.invested_cents ?? 0), 0),
  )

  const openCreditInvoicesByAccount = computed(() =>
    transactionsStore.creditInvoicesByAccount(selectedMonth.value, 'open'),
  )
  const openInvoiceCount = computed(() => openCreditInvoicesByAccount.value.size)
  const openInvoiceTotalCents = computed(() => {
    let total = 0
    for (const transactions of openCreditInvoicesByAccount.value.values()) {
      total += transactions.reduce((sum: number, tx: DashboardTx) => sum + Math.abs(tx.amount_cents), 0)
    }
    return total
  })

  const unpaidDebitMonth = computed(() =>
    (transactionsStore.transactions as DashboardTx[]).filter(tx =>
      isPendingDebitExpenseTransactionForMonth(tx, selectedMonth.value) && !tx.paid,
    ),
  )
  const unpaidDebitMonthCents = computed(() =>
    unpaidDebitMonth.value.reduce((sum, tx) => sum + Math.abs(tx.amount_cents), 0),
  )
  const recurringPendingExpenses = computed(() =>
    (recurrentsStore.recurrents as DashboardRecurrent[]).filter(rec => {
      if (!rec.active || rec.kind !== 'expense') return false
      return !transactionsStore.hasRecurrentTransaction(rec.id, selectedMonth.value)
    }),
  )
  const recurringPendingExpenseCents = computed(() =>
    recurringPendingExpenses.value.reduce((sum, rec) => sum + Math.abs(rec.amount_cents), 0),
  )
  const pendingTotalCents = computed(() =>
    openInvoiceTotalCents.value + unpaidDebitMonthCents.value + recurringPendingExpenseCents.value,
  )
  const pendingCount = computed(() =>
    openInvoiceCount.value + unpaidDebitMonth.value.length + recurringPendingExpenses.value.length,
  )

  // ── Weekly flow ──

  const daysInSelectedMonth = computed(() => dayjs(`${selectedMonth.value}-01`).daysInMonth())

  const flowByWeek = computed<WeeklyFlow[]>(() => {
    const weekCount = Math.ceil(daysInSelectedMonth.value / 7)
    const buckets = Array.from({ length: weekCount }, (_item, index) => {
      const start = index * 7 + 1
      const end = Math.min(start + 6, daysInSelectedMonth.value)
      return { label: `S${index + 1}`, start, end, inCents: 0, outCents: 0, netCents: 0 }
    })
    for (const tx of monthTransactions.value) {
      if (tx.type === 'transfer') continue
      const day = Number.parseInt(tx.date.slice(8, 10), 10)
      if (!Number.isFinite(day) || day < 1) continue
      const bucketIndex = Math.min(weekCount - 1, Math.floor((day - 1) / 7))
      const bucket = buckets[bucketIndex]
      if (!bucket) continue
      if (tx.amount_cents >= 0) bucket.inCents += tx.amount_cents
      else bucket.outCents += Math.abs(tx.amount_cents)
      bucket.netCents += tx.amount_cents
    }
    return buckets
  })

  const hasFlowData = computed(() =>
    flowByWeek.value.some(item => item.inCents > 0 || item.outCents > 0),
  )

  const flowMaxCents = computed(() => {
    const max = Math.max(...flowByWeek.value.flatMap(item => [item.inCents, item.outCents]), 0)
    return max <= 0 ? 1 : max
  })

  const flowColumnsStyle = computed(() => ({
    gridTemplateColumns: `repeat(${Math.max(flowByWeek.value.length, 1)}, minmax(0, 1fr))`,
  }))

  function flowBarHeight(value: number): string {
    if (value <= 0) return '4%'
    const percentage = (value / flowMaxCents.value) * 100
    return `${Math.max(percentage, 8)}%`
  }

  function flowTooltip(item: WeeklyFlow): string {
    return [
      `${item.label} (${item.start}-${item.end})`,
      `Entradas: ${formatCentsToBRL(item.inCents)}`,
      `Saidas: ${formatCentsToBRL(-item.outCents)}`,
      `Resultado: ${formatCentsToBRL(item.netCents)}`,
    ].join('\n')
  }

  // ── Expense by method ──

  const expenseByMethod = computed(() => {
    let credit = 0; let debit = 0; let other = 0
    for (const tx of monthTransactions.value) {
      if (tx.type === 'transfer') continue
      if (tx.amount_cents >= 0) continue
      const amount = Math.abs(tx.amount_cents)
      if (tx.payment_method === 'credit') credit += amount
      else if (tx.payment_method === 'debit') debit += amount
      else other += amount
    }
    return { credit, debit, other, total: credit + debit + other }
  })

  const expenseMixGradient = computed(() => {
    const { credit, debit, other, total } = expenseByMethod.value
    if (total <= 0) return 'conic-gradient(#3f3f46 0deg 360deg)'
    const slices: string[] = []
    let start = 0
    const addSlice = (value: number, color: string) => {
      if (value <= 0) return
      const end = start + (value / total) * 360
      slices.push(`${color} ${start}deg ${end}deg`)
      start = end
    }
    addSlice(credit, '#ef4444')
    addSlice(debit, '#f59e0b')
    addSlice(other, '#64748b')
    if (start < 360) slices.push(`#3f3f46 ${start}deg 360deg`)
    return `conic-gradient(${slices.join(', ')})`
  })

  // ── Transaction type breakdown ──

  const transactionTypeBreakdown = computed(() => {
    let income = 0; let expense = 0; let transfer = 0
    for (const tx of monthTransactions.value) {
      const amount = Math.abs(tx.amount_cents)
      if (tx.type === 'income') income += amount
      else if (tx.type === 'transfer') transfer += amount
      else expense += amount
    }
    return { income, expense, transfer, total: income + expense + transfer }
  })

  const transactionTypeItems = computed(() => [
    { key: 'income', label: 'Receitas', value: transactionTypeBreakdown.value.income, color: 'bg-emerald-500' },
    { key: 'expense', label: 'Despesas', value: transactionTypeBreakdown.value.expense, color: 'bg-red-500' },
    { key: 'transfer', label: 'Transferencias', value: transactionTypeBreakdown.value.transfer, color: 'bg-blue-500' },
  ])

  // ── Expense payment status ──

  const expensePaymentStatus = computed(() => {
    let paidCents = 0; let pendingCents = 0; let paidCount = 0; let pendingCount = 0
    for (const tx of monthTransactions.value) {
      if (tx.type === 'transfer') continue
      if (tx.amount_cents >= 0) continue
      const amount = Math.abs(tx.amount_cents)
      if (tx.paid) { paidCents += amount; paidCount += 1 }
      else { pendingCents += amount; pendingCount += 1 }
    }
    return { paidCents, pendingCents, paidCount, pendingCount, totalCents: paidCents + pendingCents }
  })

  const expensePaymentItems = computed(() => [
    { key: 'paid', label: 'Pagas', value: expensePaymentStatus.value.paidCents, count: expensePaymentStatus.value.paidCount, color: 'bg-emerald-500' },
    { key: 'pending', label: 'Pendentes', value: expensePaymentStatus.value.pendingCents, count: expensePaymentStatus.value.pendingCount, color: 'bg-yellow-500' },
  ])

  // ── Investment summary ──

  const investmentSummary = computed(() => {
    let totalInvestedCents = 0; let totalCurrentCents = 0
    let fixedCurrentCents = 0; let variableCurrentCents = 0

    const items = (investmentPositionsStore.positions as DashboardPosition[])
      .map((position) => {
        const investedCents = position.invested_cents ?? position.principal_cents ?? 0
        const currentCents = position.current_value_cents ?? position.invested_cents ?? position.principal_cents ?? 0
        totalInvestedCents += investedCents
        totalCurrentCents += currentCents
        if (position.bucket === 'fixed') fixedCurrentCents += currentCents
        else variableCurrentCents += currentCents
        const label = position.asset_code?.trim() || position.name?.trim() || 'Posicao'
        return { id: position.id, label, bucket: position.bucket ?? 'variable', investedCents, currentCents, pnlCents: currentCents - investedCents }
      })
      .filter(item => item.currentCents > 0 || item.investedCents > 0)

    const topPositions = [...items].sort((a, b) => b.currentCents - a.currentCents).slice(0, 5)
    return {
      totalInvestedCents, totalCurrentCents, totalPnlCents: totalCurrentCents - totalInvestedCents,
      fixedCurrentCents, variableCurrentCents,
      totalCurrentByBucket: fixedCurrentCents + variableCurrentCents,
      topPositions,
    }
  })

  const investmentBucketItems = computed(() => [
    { key: 'fixed', label: 'Renda fixa', value: investmentSummary.value.fixedCurrentCents, color: 'bg-blue-500' },
    { key: 'variable', label: 'Renda variavel', value: investmentSummary.value.variableCurrentCents, color: 'bg-cyan-500' },
  ])

  // ── Investment period analysis ──

  function belongsToYear(date: string, targetYear: string): boolean {
    return typeof date === 'string' && date.slice(0, 4) === targetYear
  }

  const selectedYear = computed(() => selectedMonth.value.slice(0, 4))
  const investmentEvents = computed(() => investmentEventsStore.events as DashboardInvestmentEvent[])

  const investmentEventsForPeriod = computed(() => {
    if (investmentPeriodTab.value === 'all') return investmentEvents.value
    if (investmentPeriodTab.value === 'year') {
      return investmentEvents.value.filter(e => belongsToYear(e.date, selectedYear.value))
    }
    return investmentEvents.value.filter(e => belongsToMonth(e.date, selectedMonth.value))
  })

  const monthInvestmentEvents = computed(() =>
    investmentEvents.value
      .filter(e => belongsToMonth(e.date, selectedMonth.value))
      .sort((a, b) => (b.date.localeCompare(a.date) || b.id.localeCompare(a.id))),
  )

  const investmentPeriodSummary = computed(() => {
    let incomingCents = 0; let outgoingCents = 0; let incomeCents = 0
    for (const event of investmentEventsForPeriod.value) {
      const amount = Math.abs(event.amount_cents)
      if (event.event_type === 'buy' || event.event_type === 'contribution') incomingCents += amount
      else if (event.event_type === 'income') incomeCents += amount
      else outgoingCents += amount
    }
    return {
      incomingCents, outgoingCents, incomeCents,
      eventCount: investmentEventsForPeriod.value.length,
      netCents: incomingCents + incomeCents - outgoingCents,
      totalFlowCents: incomingCents + outgoingCents + incomeCents,
    }
  })

  const investmentPeriodItems = computed(() => [
    { key: 'incoming', label: 'Aportes e compras', value: investmentPeriodSummary.value.incomingCents, color: 'bg-blue-500' },
    { key: 'income', label: 'Rendimentos', value: investmentPeriodSummary.value.incomeCents, color: 'bg-emerald-500' },
    { key: 'outgoing', label: 'Saidas e resgates', value: investmentPeriodSummary.value.outgoingCents, color: 'bg-red-500' },
  ])

  const investmentPeriodDescription = computed(() => {
    if (investmentPeriodTab.value === 'month') return selectedMonthLabel.value
    if (investmentPeriodTab.value === 'year') return selectedYear.value
    return 'Todo o periodo'
  })

  // ── Chart helpers ──

  function formatAxisCurrency(cents: number): string {
    const abs = Math.abs(cents)
    if (abs >= 100000000) return `R$ ${(cents / 100000000).toFixed(1)}M`
    if (abs >= 100000) return `R$ ${(cents / 100000).toFixed(1)}K`
    return formatCentsToBRL(cents)
  }

  function monthLabelFromKey(month: string): string {
    const [year = '0000', monthValue = '01'] = month.split('-')
    const date = new Date(Number(year), Number(monthValue) - 1, 1)
    const monthLabel = monthShortFormatter.format(date).replace('.', '')
    return `${monthLabel}/${year.slice(2)}`
  }

  // ── Flow chart ──

  const flowChartMonths = computed(() => {
    const end = dayjs(`${selectedMonth.value}-01`)
    return Array.from({ length: 6 }, (_item, index) =>
      end.subtract(5 - index, 'month').format('YYYY-MM'),
    )
  })

  const flowChartData = computed<ChartData<'bar'>>(() => ({
    labels: flowChartMonths.value.map(monthLabelFromKey),
    datasets: [
      {
        label: 'Entradas',
        data: flowChartMonths.value.map(month => entriesForMonth(month)),
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        borderRadius: 6,
        maxBarThickness: 32,
      },
      {
        label: 'Saidas',
        data: flowChartMonths.value.map(month => expensesForMonth(month)),
        backgroundColor: 'rgba(239, 68, 68, 0.85)',
        borderRadius: 6,
        maxBarThickness: 32,
      },
    ],
  }))

  const flowChartHasData = computed(() =>
    flowChartData.value.datasets.some(ds => (ds.data as number[]).some(v => v > 0)),
  )

  const flowChartOptions = computed<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: chartLegendColor } },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'bar'>) =>
            `${context.dataset.label}: ${formatCentsToBRL(Number(context.parsed.y ?? 0))}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: chartTickColor } },
      y: {
        beginAtZero: true,
        ticks: { color: chartTickColor, callback: value => formatAxisCurrency(Number(value)) },
        grid: { color: chartGridColor },
      },
    },
  }))

  // ── Type chart ──

  const spendingByType = computed(() => {
    let debit = 0; let credit = 0; let transfer = 0
    for (const tx of monthTransactions.value) {
      if (tx.type === 'transfer') { transfer += Math.abs(tx.amount_cents); continue }
      if (tx.amount_cents >= 0) continue
      const amount = Math.abs(tx.amount_cents)
      if (tx.payment_method === 'credit') credit += amount
      else debit += amount
    }
    return { debit, credit, transfer, total: debit + credit + transfer }
  })

  const typeChartData = computed<ChartData<'doughnut'>>(() => ({
    labels: ['Debito', 'Credito', 'Transferencia'],
    datasets: [{
      data: [spendingByType.value.debit, spendingByType.value.credit, spendingByType.value.transfer],
      backgroundColor: ['rgba(59, 130, 246, 0.85)', 'rgba(239, 68, 68, 0.85)', 'rgba(14, 165, 233, 0.85)'],
      borderColor: ['#1e40af', '#991b1b', '#0c4a6e'],
      borderWidth: 1,
      hoverOffset: 6,
    }],
  }))

  const typeChartHasData = computed(() => spendingByType.value.total > 0)

  const typeChartOptions = computed<ChartOptions<'doughnut'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: chartLegendColor } },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'doughnut'>) => {
            const value = Number(context.parsed ?? 0)
            const percentage = percentOf(value, spendingByType.value.total)
            return `${context.label}: ${formatCentsToBRL(value)} (${percentage})`
          },
        },
      },
    },
  }))

  // ── Status chart ──

  const statusChartData = computed<ChartData<'bar'>>(() => ({
    labels: [selectedMonthLabel.value],
    datasets: [
      { label: 'Pago', data: [expensePaymentStatus.value.paidCents], backgroundColor: 'rgba(34, 197, 94, 0.85)', borderRadius: 6, stack: 'status', maxBarThickness: 60 },
      { label: 'Pendente', data: [expensePaymentStatus.value.pendingCents], backgroundColor: 'rgba(245, 158, 11, 0.9)', borderRadius: 6, stack: 'status', maxBarThickness: 60 },
    ],
  }))

  const statusChartHasData = computed(() => expensePaymentStatus.value.totalCents > 0)

  const statusChartOptions = computed<ChartOptions<'bar'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: chartLegendColor } },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'bar'>) =>
            `${context.dataset.label}: ${formatCentsToBRL(Number(context.parsed.y ?? 0))}`,
        },
      },
    },
    scales: {
      x: { stacked: true, grid: { display: false }, ticks: { color: chartTickColor } },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { color: chartTickColor, callback: value => formatAxisCurrency(Number(value)) },
        grid: { color: chartGridColor },
      },
    },
  }))

  // ── Investment evolution chart ──

  function investmentFlowDelta(event: DashboardInvestmentEvent): number {
    const amount = Math.abs(event.amount_cents)
    if (event.event_type === 'sell' || event.event_type === 'withdrawal' || event.event_type === 'maturity') {
      return -amount
    }
    return amount
  }

  const investmentEvolutionPoints = computed<InvestmentEvolutionPoint[]>(() => {
    const events = [...investmentEventsForPeriod.value]
      .sort((a, b) => (a.date.localeCompare(b.date) || a.id.localeCompare(b.id)))
    if (!events.length) return []

    if (investmentPeriodTab.value === 'month') {
      const baseDate = dayjs(`${selectedMonth.value}-01`)
      const daysInMonth = baseDate.daysInMonth()
      const deltasByDate = new Map<string, number>()
      for (const event of events) {
        const key = event.date.slice(0, 10)
        deltasByDate.set(key, (deltasByDate.get(key) ?? 0) + investmentFlowDelta(event))
      }
      let cumulative = 0
      return Array.from({ length: daysInMonth }, (_item, index) => {
        const day = index + 1
        const date = baseDate.date(day)
        const key = date.format('YYYY-MM-DD')
        cumulative += deltasByDate.get(key) ?? 0
        return { label: date.format('DD/MM'), valueCents: cumulative }
      })
    }

    const deltasByMonth = new Map<string, number>()
    for (const event of events) {
      const month = event.date.slice(0, 7)
      deltasByMonth.set(month, (deltasByMonth.get(month) ?? 0) + investmentFlowDelta(event))
    }

    if (investmentPeriodTab.value === 'year') {
      const year = selectedYear.value
      let cumulative = 0
      return Array.from({ length: 12 }, (_item, index) => {
        const month = `${year}-${String(index + 1).padStart(2, '0')}`
        cumulative += deltasByMonth.get(month) ?? 0
        return { label: monthLabelFromKey(month), valueCents: cumulative }
      })
    }

    const sortedMonths = [...deltasByMonth.keys()].sort((a, b) => a.localeCompare(b))
    if (!sortedMonths.length) return []
    const firstMonth = dayjs(`${sortedMonths[0]}-01`)
    const lastMonth = dayjs(`${sortedMonths[sortedMonths.length - 1]}-01`)
    const totalMonths = Math.max(1, lastMonth.diff(firstMonth, 'month') + 1)
    let cumulative = 0
    return Array.from({ length: totalMonths }, (_item, index) => {
      const month = firstMonth.add(index, 'month').format('YYYY-MM')
      cumulative += deltasByMonth.get(month) ?? 0
      return { label: monthLabelFromKey(month), valueCents: cumulative }
    })
  })

  const investmentEvolutionChartData = computed<ChartData<'line'>>(() => ({
    labels: investmentEvolutionPoints.value.map(p => p.label),
    datasets: [{
      label: 'Valor investido acumulado',
      data: investmentEvolutionPoints.value.map(p => p.valueCents),
      borderColor: 'rgba(59, 130, 246, 0.95)',
      backgroundColor: 'rgba(59, 130, 246, 0.20)',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 2,
      pointHoverRadius: 4,
    }],
  }))

  const investmentEvolutionChartHasData = computed(() =>
    investmentEvolutionPoints.value.some(p => p.valueCents !== 0),
  )

  const investmentEvolutionChartOptions = computed<ChartOptions<'line'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: chartLegendColor } },
      tooltip: {
        callbacks: {
          label: (context: TooltipItem<'line'>) =>
            `${context.dataset.label}: ${formatCentsToBRL(Number(context.parsed.y ?? 0))}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: chartTickColor, autoSkip: true, maxTicksLimit: investmentPeriodTab.value === 'month' ? 8 : 12 },
      },
      y: {
        beginAtZero: true,
        ticks: { color: chartTickColor, callback: value => formatAxisCurrency(Number(value)) },
        grid: { color: chartGridColor },
      },
    },
  }))

  // ── Investment event display helpers ──

  function investmentEventTypeLabel(eventType: DashboardInvestmentEvent['event_type']): string {
    if (eventType === 'buy') return 'Compra'
    if (eventType === 'sell') return 'Venda'
    if (eventType === 'contribution') return 'Aporte'
    if (eventType === 'withdrawal') return 'Resgate'
    if (eventType === 'maturity') return 'Vencimento'
    return 'Rendimento'
  }

  function investmentEventSignedCents(event: DashboardInvestmentEvent): number {
    if (event.event_type === 'buy' || event.event_type === 'contribution' || event.event_type === 'income') {
      return Math.abs(event.amount_cents)
    }
    return -Math.abs(event.amount_cents)
  }

  function investmentEventAmountClass(event: DashboardInvestmentEvent): string {
    if (event.event_type === 'income') return 'text-emerald-400'
    if (event.event_type === 'sell' || event.event_type === 'withdrawal' || event.event_type === 'maturity') return 'text-red-500'
    return 'text-blue-500'
  }

  function investmentPositionLabel(positionId: string): string {
    const position = (investmentPositionsStore.positions as DashboardPosition[])
      .find(p => p.id === positionId)
    if (!position) return 'Posicao'
    return position.asset_code?.trim() || position.name?.trim() || 'Posicao'
  }

  // ── Alerts ──

  const dashboardAlerts = computed(() => [
    ...groupedAlerts.value.overdue,
    ...groupedAlerts.value.today,
    ...groupedAlerts.value.next,
  ].slice(0, 6))

  function alertBucketLabel(bucket: AlertBucket): string {
    if (bucket === 'overdue') return 'Atrasado'
    if (bucket === 'today') return 'Hoje'
    return 'Proximo'
  }

  function alertBucketClass(bucket: AlertBucket): string {
    if (bucket === 'overdue') return 'border-red-500/30 text-red-500'
    if (bucket === 'today') return 'border-yellow-500/30 text-yellow-500'
    return 'border-blue-500/30 text-blue-500'
  }

  function isIncomeAlert(item: AlertItem): boolean {
    return item.kind === 'income'
  }

  function formatAlertAmount(item: AlertItem): string {
    if (!item.amountCents) return ''
    return formatCentsToBRL(isIncomeAlert(item) ? item.amountCents : -item.amountCents)
  }

  function alertAmountClass(item: AlertItem): string {
    return isIncomeAlert(item) ? 'text-emerald-400' : 'text-red-500'
  }

  function alertIcon(item: AlertItem) {
    if (item.alertType === 'invoice_due' || item.alertType === 'invoice_closing') return CreditCard
    return BellRing
  }

  function shortDateLabel(isoDate: string): string {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`
    return isoDate
  }

  // ── Latest transactions ──

  const latestTransactions = computed(() =>
    [...monthTransactions.value]
      .sort((a: DashboardTx, b: DashboardTx) => (b.date.localeCompare(a.date) || b.id.localeCompare(a.id)))
      .slice(0, 12),
  )

  function getAccountLabel(accountId: number) {
    return accountsStore.accounts.find((account: any) => account.id === accountId)?.label ?? 'Conta'
  }

  function txDisplayLabel(tx: DashboardTx): string {
    if (tx.installment) return `${tx.installment.product} (${tx.installment.index}/${tx.installment.total})`
    return tx.description || 'Transacao'
  }

  function txTypeLabel(tx: DashboardTx): string {
    if (tx.type === 'income') return 'Receita'
    if (tx.type === 'transfer') return 'Transferencia'
    return 'Despesa'
  }

  function txTypeIcon(tx: DashboardTx) {
    if (tx.type === 'income') return ArrowUpRight
    if (tx.type === 'transfer') return Repeat
    return ArrowDownRight
  }

  function txDateLabel(isoDate: string): string {
    const todayIso = dayjs().format('YYYY-MM-DD')
    const yesterdayIso = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
    if (selectedMonth.value === todayIso.slice(0, 7)) {
      if (isoDate === todayIso) return 'Hoje'
      if (isoDate === yesterdayIso) return 'Ontem'
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`
    return isoDate
  }

  return {
    // Month
    selectedMonthLabel, prevMonth, nextMonth,
    // Financials
    monthEntriesCents, monthExpensesCents,
    entriesVariation, expensesVariation,
    monthNetCents, monthNetVariation,
    balanceTotalCents, investedTotalCents,
    // Credit
    openInvoiceCount, openInvoiceTotalCents,
    // Pending
    unpaidDebitMonthCents, recurringPendingExpenseCents,
    pendingTotalCents, pendingCount,
    // Flow widget
    flowByWeek, hasFlowData, flowMaxCents, flowColumnsStyle, flowBarHeight, flowTooltip,
    // Expense distribution
    expenseByMethod, expenseMixGradient,
    // Breakdown
    transactionTypeBreakdown, transactionTypeItems, spendingByType,
    // Payment status
    expensePaymentStatus, expensePaymentItems,
    // Investments
    investmentSummary, investmentBucketItems,
    monthInvestmentEvents, investmentEventsForPeriod,
    investmentPeriodSummary, investmentPeriodItems, investmentPeriodDescription,
    // Charts
    flowChartData, flowChartHasData, flowChartOptions,
    typeChartData, typeChartHasData, typeChartOptions,
    statusChartData, statusChartHasData, statusChartOptions,
    investmentEvolutionPoints, investmentEvolutionChartData,
    investmentEvolutionChartHasData, investmentEvolutionChartOptions,
    // Investment helpers
    investmentPositionLabel, investmentEventTypeLabel,
    investmentEventSignedCents, investmentEventAmountClass,
    // Alerts
    counts, dashboardAlerts,
    alertBucketLabel, alertBucketClass,
    formatAlertAmount, alertAmountClass, alertIcon,
    shortDateLabel,
    // Latest transactions
    latestTransactions, getAccountLabel,
    txDisplayLabel, txTypeLabel, txTypeIcon, txDateLabel,
  }
}
