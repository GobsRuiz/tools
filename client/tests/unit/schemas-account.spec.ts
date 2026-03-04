import { describe, expect, it } from 'vitest'
import { accountSchema } from '~~/schemas/zod-schemas'

const baseAccount = {
  bank: 'banco x',
  label: 'Conta Principal',
  type: 'bank' as const,
  balance_cents: 0,
}

describe('accountSchema - credit card pair rule', () => {
  it('rejeita conta apenas com card_closing_day', () => {
    const result = accountSchema.safeParse({
      ...baseAccount,
      card_closing_day: 8,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita conta apenas com card_due_day', () => {
    const result = accountSchema.safeParse({
      ...baseAccount,
      card_due_day: 15,
    })

    expect(result.success).toBe(false)
  })

  it('aceita conta sem closing_day e sem due_day', () => {
    const result = accountSchema.safeParse(baseAccount)
    expect(result.success).toBe(true)
  })

  it('aceita conta com closing_day e due_day preenchidos', () => {
    const result = accountSchema.safeParse({
      ...baseAccount,
      card_closing_day: 8,
      card_due_day: 15,
    })

    expect(result.success).toBe(true)
  })
})
