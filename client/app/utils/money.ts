/**
 * "1.234,56" ou "1234,56" ou "1234.56" → 123456 (centavos)
 */
const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function parseBRLToCents(input: string): number {
  const normalized = input
    .replace(/[R$\s\u00A0]/g, '')
    .replace(/[^0-9,.\-]/g, '')

  if (!normalized) return 0

  const sign = normalized.includes('-') ? -1 : 1
  const unsigned = normalized.replace(/-/g, '')
  if (!unsigned) return 0

  const lastDot = unsigned.lastIndexOf('.')
  const lastComma = unsigned.lastIndexOf(',')
  const hasDot = lastDot !== -1
  const hasComma = lastComma !== -1

  let integerPart = ''
  let fractionPart = ''

  if (hasDot && hasComma) {
    const decimalIndex = Math.max(lastDot, lastComma)
    integerPart = unsigned.slice(0, decimalIndex).replace(/[.,]/g, '')
    fractionPart = unsigned.slice(decimalIndex + 1).replace(/[.,]/g, '')
  } else if (hasDot || hasComma) {
    const separator = hasDot ? '.' : ','
    const separatorIndex = hasDot ? lastDot : lastComma
    const candidateFraction = unsigned.slice(separatorIndex + 1).replace(/[.,]/g, '')

    // One separator with 1-2 trailing digits is treated as decimal.
    if (candidateFraction.length >= 1 && candidateFraction.length <= 2) {
      integerPart = unsigned.slice(0, separatorIndex).replace(/[.,]/g, '')
      fractionPart = candidateFraction
    } else {
      // Otherwise treat separators as thousands delimiters.
      integerPart = unsigned.replace(/[.,]/g, '')
    }
  } else {
    integerPart = unsigned
  }

  const safeInteger = integerPart.replace(/\D/g, '') || '0'
  const safeFraction = fractionPart.replace(/\D/g, '')

  const value = Number.parseFloat(`${safeInteger}.${safeFraction || '0'}`)
  if (!Number.isFinite(value)) return 0

  return Math.round(value * 100) * sign
}

/**
 * 123456 → "R$ 1.234,56"
 */
export function formatCentsToBRL(cents: number): string {
  const formattedAbs = brlFormatter.format(Math.abs(cents) / 100)

  return cents < 0 ? `-${formattedAbs}` : formattedAbs
}
