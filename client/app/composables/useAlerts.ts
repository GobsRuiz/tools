import dayjs from 'dayjs'
import { computed } from 'vue'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { monthKey } from '~/utils/dates'
import { computeCreditInvoiceDueDate } from '~/utils/invoice-cycle'

export type AlertBucket = 'overdue' | 'today' | 'next'
export type AlertType = 'recurrent' | 'invoice_due' | 'invoice_closing'
export type AlertKind = 'income' | 'expense'

export interface AlertItem {
  id: string
  alertType: AlertType
  kind: AlertKind
  bucket: AlertBucket
  accountId: number
  accountLabel: string
  title: string
  subtitle: string
  targetDate: string
  amountCents?: number
  daysUntil: number
}

interface GroupedAlerts {
  overdue: AlertItem[]
  today: AlertItem[]
  next: AlertItem[]
}

interface InvoiceDueCandidate {
  targetDate: string
  amountCents: number
  daysUntil: number
  bucket: AlertBucket
}

function clampDay(year: number, monthIndexOneBased: number, day: number): number {
  const maxDay = new Date(year, monthIndexOneBased, 0).getDate()
  return Math.min(Math.max(Math.trunc(day), 1), maxDay)
}

function dateForDayInCurrentMonth(base: dayjs.Dayjs, day: number): string {
  const year = base.year()
  const month = base.month() + 1
  const safeDay = clampDay(year, month, day)
  return dayjs(new Date(year, month - 1, safeDay)).format('YYYY-MM-DD')
}

function dateForNextMonthlyOccurrence(base: dayjs.Dayjs, day: number): string {
  const currentMonthDate = dayjs(dateForDayInCurrentMonth(base, day)).startOf('day')
  if (currentMonthDate.isBefore(base.startOf('day'))) {
    return dateForDayInCurrentMonth(base.add(1, 'month'), day)
  }
  return currentMonthDate.format('YYYY-MM-DD')
}

function toBucket(daysUntil: number): AlertBucket | null {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil <= 2) return 'next'
  return null
}

function toClosingBucket(daysUntil: number): AlertBucket | null {
  if (daysUntil === 0) return 'today'
  if (daysUntil > 0 && daysUntil <= 2) return 'next'
  return null
}

function alertSort(a: AlertItem, b: AlertItem): number {
  if (a.daysUntil !== b.daysUntil) return a.daysUntil - b.daysUntil
  if (a.targetDate !== b.targetDate) return a.targetDate.localeCompare(b.targetDate)
  if (a.accountLabel !== b.accountLabel) return a.accountLabel.localeCompare(b.accountLabel)
  return a.title.localeCompare(b.title)
}

export function useAlerts() {
  const accountsStore = useAccountsStore()
  const transactionsStore = useTransactionsStore()
  const recurrentsStore = useRecurrentsStore()

  const today = computed(() => dayjs().startOf('day'))

  function isInMonth(date: string, month: string): boolean {
    return monthKey(date) === month || (typeof date === 'string' && date.slice(0, 7) === month)
  }

  function isRecurrentResolvedInMonth(recurrentId: string, month: string): boolean {
    return transactionsStore.transactions.some((tx) => {
      if (tx.recurrentId !== recurrentId) return false
      if (!isInMonth(tx.date, month)) return false
      return tx.paid
    })
  }

  const accountById = computed(() => {
    const map = new Map<number, {
      id: number
      label: string
      card_due_day?: number
      card_closing_day?: number
    }>()
    for (const account of accountsStore.accounts) {
      map.set(account.id, account)
    }
    return map
  })

  const unpaidCreditDueByAccount = computed(() => {
    const grouped = new Map<number, Map<string, number>>()

    for (const tx of transactionsStore.transactions) {
      if (tx.paid || tx.payment_method !== 'credit') continue

      const account = accountById.value.get(tx.accountId)
      if (!hasCompleteCreditCardConfig(account)) continue

      const dueDate = computeCreditInvoiceDueDate(tx.date, account.card_due_day, account.card_closing_day)
      if (!dueDate) continue

      const amountCents = Math.abs(tx.amount_cents)
      if (amountCents <= 0) continue

      const accountGroup = grouped.get(account.id) ?? new Map<string, number>()
      accountGroup.set(dueDate, (accountGroup.get(dueDate) ?? 0) + amountCents)
      grouped.set(account.id, accountGroup)
    }

    return grouped
  })

  function pickInvoiceDueCandidate(accountId: number): InvoiceDueCandidate | null {
    const accountDueGroups = unpaidCreditDueByAccount.value.get(accountId)
    if (!accountDueGroups || accountDueGroups.size === 0) return null

    let bestOverdue: InvoiceDueCandidate | null = null
    let bestUpcoming: InvoiceDueCandidate | null = null

    for (const [targetDate, amountCents] of accountDueGroups) {
      if (amountCents <= 0) continue

      const daysUntil = dayjs(targetDate).startOf('day').diff(today.value, 'day')

      if (daysUntil < 0) {
        if (!bestOverdue || daysUntil > bestOverdue.daysUntil) {
          bestOverdue = {
            targetDate,
            amountCents,
            daysUntil,
            bucket: 'overdue',
          }
        }
        continue
      }

      if (daysUntil > 2) continue
      const bucket = toBucket(daysUntil)
      if (!bucket) continue

      if (!bestUpcoming || daysUntil < bestUpcoming.daysUntil) {
        bestUpcoming = {
          targetDate,
          amountCents,
          daysUntil,
          bucket,
        }
      }
    }

    if (bestOverdue) return bestOverdue
    return bestUpcoming
  }

  const openCreditCycleByAccount = computed(() => {
    const cycleMonth = monthKey(today.value.format('YYYY-MM-DD'))
    return transactionsStore.creditInvoicesByAccount(cycleMonth, 'open')
  })

  const openCreditCycleAmountByAccount = computed(() => {
    const grouped = new Map<number, number>()
    for (const [accountId, transactions] of openCreditCycleByAccount.value) {
      grouped.set(accountId, transactions.reduce((sum, tx) => sum + tx.amount_cents, 0))
    }
    return grouped
  })

  const recurrentAlerts = computed<AlertItem[]>(() => {
    const items: AlertItem[] = []

    for (const rec of recurrentsStore.recurrents) {
      if (!rec.active || !rec.notify) continue

      const paymentMethod = rec.payment_method ?? 'debit'
      if (rec.kind === 'expense' && paymentMethod === 'credit') {
        continue
      }

      const day = rec.kind === 'expense' ? rec.due_day : rec.day_of_month
      if (!day) continue

      const targetDate = dateForNextMonthlyOccurrence(today.value, day)
      const daysUntil = dayjs(targetDate).startOf('day').diff(today.value, 'day')
      const bucket = toBucket(daysUntil)
      if (!bucket) continue

      const cycleMonth = monthKey(targetDate)
      if (isRecurrentResolvedInMonth(rec.id, cycleMonth)) continue

      const account = accountsStore.accounts.find(a => a.id === rec.accountId)
      const accountLabel = account?.label ?? 'Conta'
      const amountCents = Math.abs(rec.amount_cents)

      items.push({
        id: `recurrent:${rec.id}:${targetDate}`,
        alertType: 'recurrent',
        kind: rec.kind === 'income' ? 'income' : 'expense',
        bucket,
        accountId: rec.accountId,
        accountLabel,
        title: rec.name,
        subtitle: rec.kind === 'income' ? 'Recorrente de receita' : 'Recorrente de despesa',
        targetDate,
        amountCents,
        daysUntil,
      })
    }

    return items.sort(alertSort)
  })

  const invoiceDueAlerts = computed<AlertItem[]>(() => {
    const items: AlertItem[] = []

    for (const account of accountsStore.accounts) {
      if (!hasCompleteCreditCardConfig(account)) continue
      const candidate = pickInvoiceDueCandidate(account.id)
      if (!candidate) continue

      items.push({
        id: `invoice_due:${account.id}:${candidate.targetDate}`,
        alertType: 'invoice_due',
        kind: 'expense',
        bucket: candidate.bucket,
        accountId: account.id,
        accountLabel: account.label,
        title: `Fatura ${account.label}`,
        subtitle: 'Vencimento da fatura',
        targetDate: candidate.targetDate,
        amountCents: candidate.amountCents,
        daysUntil: candidate.daysUntil,
      })
    }

    return items.sort(alertSort)
  })

  const invoiceClosingAlerts = computed<AlertItem[]>(() => {
    const items: AlertItem[] = []

    for (const account of accountsStore.accounts) {
      if (!hasCompleteCreditCardConfig(account)) continue
      const openAmountCents = Math.abs(openCreditCycleAmountByAccount.value.get(account.id) ?? 0)

      const targetDate = dateForNextMonthlyOccurrence(today.value, account.card_closing_day)
      const daysUntil = dayjs(targetDate).startOf('day').diff(today.value, 'day')
      const bucket = toClosingBucket(daysUntil)
      if (!bucket) continue

      items.push({
        id: `invoice_closing:${account.id}:${targetDate}`,
        alertType: 'invoice_closing',
        kind: 'expense',
        bucket,
        accountId: account.id,
        accountLabel: account.label,
        title: `Fatura ${account.label}`,
        subtitle: 'Fechamento da fatura (melhor dia para comprar)',
        targetDate,
        amountCents: openAmountCents > 0 ? openAmountCents : undefined,
        daysUntil,
      })
    }

    return items.sort(alertSort)
  })

  const allAlerts = computed<AlertItem[]>(() => [
    ...recurrentAlerts.value,
    ...invoiceDueAlerts.value,
    ...invoiceClosingAlerts.value,
  ].sort(alertSort))

  const groupedAlerts = computed<GroupedAlerts>(() => {
    const grouped: GroupedAlerts = { overdue: [], today: [], next: [] }
    for (const alert of allAlerts.value) {
      grouped[alert.bucket].push(alert)
    }
    return grouped
  })

  const counts = computed(() => ({
    overdue: groupedAlerts.value.overdue.length,
    today: groupedAlerts.value.today.length,
    next: groupedAlerts.value.next.length,
    total: allAlerts.value.length,
  }))

  async function loadAlertSources() {
    await Promise.all([
      accountsStore.loadAccounts(),
      transactionsStore.loadTransactions(),
      recurrentsStore.loadRecurrents(),
    ])
  }

  return {
    allAlerts,
    groupedAlerts,
    counts,
    loadAlertSources,
  }
}
