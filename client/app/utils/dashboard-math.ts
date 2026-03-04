export type VariationTone = 'text-muted-foreground' | 'text-emerald-400' | 'text-red-500'

export type VariationInfo = {
  label: string
  tone: VariationTone
}

export function buildVariation(current: number, previous: number, invert = false): VariationInfo {
  if (previous === 0) {
    if (current === 0) {
      return { label: 'Sem variacao', tone: 'text-muted-foreground' }
    }
    return {
      label: 'Novo no periodo',
      tone: invert ? 'text-red-500' : 'text-emerald-400',
    }
  }

  const deltaPercent = ((current - previous) / previous) * 100
  const tone = invert
    ? (deltaPercent <= 0 ? 'text-emerald-400' : 'text-red-500')
    : (deltaPercent >= 0 ? 'text-emerald-400' : 'text-red-500')

  return {
    label: `${deltaPercent >= 0 ? '+' : ''}${deltaPercent.toFixed(1)}% vs mes anterior`,
    tone,
  }
}

export function percentOf(value: number, total: number): string {
  if (total <= 0) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

export function shareOf(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0
  return (value / total) * 100
}

export function progressWidth(value: number, total: number): string {
  const ratio = shareOf(value, total)
  if (ratio <= 0) return '0%'
  return `${Math.max(ratio, 7)}%`
}

