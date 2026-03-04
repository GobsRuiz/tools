import { describe, expect, it } from 'vitest'
import {
  investmentEventSchema,
  investmentPositionSchema,
  transactionSchema,
} from '~~/schemas/zod-schemas'

describe('schemas date validation', () => {
  it('aceita datas válidas de calendário', () => {
    const tx = transactionSchema.safeParse({
      accountId: 1,
      date: '2026-02-28',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -1000,
      paid: false,
      installment: null,
      createdAt: '2024-02-29',
    })

    expect(tx.success).toBe(true)
  })

  it('rejeita datas inválidas apesar do formato YYYY-MM-DD', () => {
    const invalidDay = transactionSchema.safeParse({
      accountId: 1,
      date: '2026-02-31',
      type: 'expense',
      amount_cents: -1000,
      paid: false,
      installment: null,
    })

    const invalidMonth = transactionSchema.safeParse({
      accountId: 1,
      date: '2026-13-01',
      type: 'expense',
      amount_cents: -1000,
      paid: false,
      installment: null,
    })

    const invalidLeap = transactionSchema.safeParse({
      accountId: 1,
      date: '2025-02-29',
      type: 'expense',
      amount_cents: -1000,
      paid: false,
      installment: null,
    })

    expect(invalidDay.success).toBe(false)
    expect(invalidMonth.success).toBe(false)
    expect(invalidLeap.success).toBe(false)
  })

  it('rejeita campos opcionais de data quando forem inválidos', () => {
    const txCreatedAt = transactionSchema.safeParse({
      accountId: 1,
      date: '2026-02-28',
      type: 'expense',
      amount_cents: -1000,
      paid: false,
      installment: null,
      createdAt: '2026-02-30',
    })

    const positionMaturity = investmentPositionSchema.safeParse({
      accountId: 1,
      bucket: 'fixed',
      investment_type: 'cdb',
      asset_code: 'CDB-TEST',
      invested_cents: 100000,
      metadata: {
        maturity_date: '2026-02-30',
      },
    })

    expect(txCreatedAt.success).toBe(false)
    expect(positionMaturity.success).toBe(false)
  })

  it('aplica mesma regra para investmentEvent', () => {
    const event = investmentEventSchema.safeParse({
      positionId: '2a9f2fcc-3f15-4e70-9856-fe6a9e5c50f4',
      accountId: 1,
      date: '2026-02-31',
      event_type: 'buy',
      amount_cents: 1000,
    })

    expect(event.success).toBe(false)
  })
})
