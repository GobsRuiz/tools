function clampDay(year: number, monthIndexOneBased: number, day: number): number {
  const maxDay = new Date(year, monthIndexOneBased, 0).getDate()
  return Math.min(Math.max(Math.trunc(day), 1), maxDay)
}

function dateFromParts(year: number, monthIndexOneBased: number, day: number): string {
  const safeDay = clampDay(year, monthIndexOneBased, day)
  const mm = String(monthIndexOneBased).padStart(2, '0')
  const dd = String(safeDay).padStart(2, '0')
  return `${year}-${mm}-${dd}`
}

function monthFromParts(year: number, monthIndexOneBased: number): string {
  const mm = String(monthIndexOneBased).padStart(2, '0')
  return `${year}-${mm}`
}

function shiftYearMonth(year: number, monthIndexOneBased: number, monthDelta: number) {
  const moved = new Date(year, monthIndexOneBased - 1 + monthDelta, 1)
  return {
    year: moved.getFullYear(),
    monthIndexOneBased: moved.getMonth() + 1,
  }
}

function parseISODateLoose(isoDate: string): { year: number, monthIndexOneBased: number, day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) return null

  const year = Number(match[1])
  const monthIndexOneBased = Number(match[2])
  const rawDay = Number(match[3])

  if (!Number.isInteger(year) || !Number.isInteger(monthIndexOneBased)) return null
  if (monthIndexOneBased < 1 || monthIndexOneBased > 12) return null

  const day = clampDay(year, monthIndexOneBased, rawDay)
  return { year, monthIndexOneBased, day }
}

/**
 * Calcula a data de vencimento da fatura para uma compra no credito.
 * Regra de ciclo:
 * - compra no dia de fechamento ou depois -> proxima fatura
 * - compra antes do fechamento -> fatura atual
 */
export function computeCreditInvoiceDueDate(
  purchaseDateISO: string,
  dueDay: number,
  closingDay?: number,
): string | null {
  const parsed = parseISODateLoose(purchaseDateISO)
  if (!parsed) return null

  if (!closingDay) {
    const dueRef = shiftYearMonth(parsed.year, parsed.monthIndexOneBased, 1)
    return dateFromParts(dueRef.year, dueRef.monthIndexOneBased, dueDay)
  }

  const effectiveClosingDay = clampDay(parsed.year, parsed.monthIndexOneBased, closingDay)
  const closesNextMonth = parsed.day >= effectiveClosingDay

  const closingRef = closesNextMonth
    ? shiftYearMonth(parsed.year, parsed.monthIndexOneBased, 1)
    : { year: parsed.year, monthIndexOneBased: parsed.monthIndexOneBased }

  const dueRef = dueDay > closingDay
    ? closingRef
    : shiftYearMonth(closingRef.year, closingRef.monthIndexOneBased, 1)

  return dateFromParts(dueRef.year, dueRef.monthIndexOneBased, dueDay)
}

/**
 * Calcula o mes do ciclo/fechamento da fatura para uma compra no credito (YYYY-MM).
 * - compra no dia de fechamento ou depois -> ciclo do mes seguinte
 * - compra antes do fechamento -> ciclo do mes atual
 */
export function computeCreditInvoiceCycleMonth(
  purchaseDateISO: string,
  closingDay?: number,
): string | null {
  const parsed = parseISODateLoose(purchaseDateISO)
  if (!parsed) return null

  if (!closingDay) {
    return monthFromParts(parsed.year, parsed.monthIndexOneBased)
  }

  const effectiveClosingDay = clampDay(parsed.year, parsed.monthIndexOneBased, closingDay)
  const closesNextMonth = parsed.day >= effectiveClosingDay

  const closingRef = closesNextMonth
    ? shiftYearMonth(parsed.year, parsed.monthIndexOneBased, 1)
    : { year: parsed.year, monthIndexOneBased: parsed.monthIndexOneBased }

  return monthFromParts(closingRef.year, closingRef.monthIndexOneBased)
}
