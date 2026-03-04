import type { InvestmentEvent, InvestmentPosition } from '~/schemas/zod-schemas'

export const investmentEventTypeOptionsVariable = [
  { label: 'Compra', value: 'buy' },
  { label: 'Venda', value: 'sell' },
  { label: 'Rendimento', value: 'income' },
] as const

export const investmentEventTypeOptionsFixed = [
  { label: 'Aporte', value: 'contribution' },
  { label: 'Resgate', value: 'withdrawal' },
  { label: 'Rendimento', value: 'income' },
  { label: 'Vencimento', value: 'maturity' },
] as const

export function getInvestmentEventTypeLabel(type: InvestmentEvent['event_type']) {
  const all = [...investmentEventTypeOptionsVariable, ...investmentEventTypeOptionsFixed]
  return all.find(option => option.value === type)?.label ?? type
}

export function isOutflowInvestmentEventType(type: InvestmentEvent['event_type']) {
  return type === 'sell' || type === 'withdrawal' || type === 'maturity'
}

export function getInvestmentEventValueColorClass(type: InvestmentEvent['event_type']) {
  if (type === 'income') return 'text-blue-500'
  return isOutflowInvestmentEventType(type) ? 'text-red-500' : 'text-green-500'
}

export function formatCentsToPtBrInput(cents?: number) {
  if (cents == null) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

export function formatQuantityPtBr(quantity: number) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 8 }).format(quantity)
}

export function getEffectiveAvailableQuantityForSell(
  position: InvestmentPosition,
  editingEvent: InvestmentEvent | null,
) {
  let available = position.quantity_total ?? 0

  if (editingEvent && editingEvent.positionId === position.id) {
    const originalQty = editingEvent.quantity ?? 0
    if (editingEvent.event_type === 'sell') {
      available += originalQty
    } else if (editingEvent.event_type === 'buy') {
      available -= originalQty
    }
  }

  return Math.max(0, available)
}

