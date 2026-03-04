import { describe, expect, it } from 'vitest'
import { investmentEventSchema } from '~~/schemas/zod-schemas'

const baseEvent = {
  positionId: '550e8400-e29b-41d4-a716-446655440000',
  accountId: 1,
  date: '2026-03-01',
  event_type: 'buy' as const,
}

describe('investmentEventSchema - amount validation', () => {
  it('rejeita amount_cents igual a zero', () => {
    const result = investmentEventSchema.safeParse({
      ...baseEvent,
      amount_cents: 0,
    })

    expect(result.success).toBe(false)
  })

  it('aceita amount_cents maior que zero', () => {
    const result = investmentEventSchema.safeParse({
      ...baseEvent,
      amount_cents: 100,
    })

    expect(result.success).toBe(true)
  })
})
