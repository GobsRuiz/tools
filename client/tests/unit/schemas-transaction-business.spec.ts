import { describe, expect, it } from 'vitest'
import { transactionSchema } from '~~/schemas/zod-schemas'

const base = {
  id: '11111111-1111-4111-8111-111111111111',
  accountId: 1,
  date: '2026-03-01',
  description: 'Teste',
  paid: true,
  installment: null,
  createdAt: '2026-03-01',
}

describe('transactionSchema - business rules', () => {
  it('aceita despesa valida', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -1000,
    })

    expect(result.success).toBe(true)
  })

  it('aceita receita valida', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'income',
      payment_method: undefined,
      amount_cents: 2500,
    })

    expect(result.success).toBe(true)
  })

  it('aceita transferencia valida', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'transfer',
      payment_method: undefined,
      destinationAccountId: 2,
      amount_cents: -5000,
    })

    expect(result.success).toBe(true)
  })

  it('rejeita transferencia sem conta de destino', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'transfer',
      payment_method: undefined,
      amount_cents: -5000,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita transferencia com origem igual ao destino', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'transfer',
      payment_method: undefined,
      destinationAccountId: 1,
      amount_cents: -5000,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita transferencia com valor positivo', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'transfer',
      payment_method: undefined,
      destinationAccountId: 2,
      amount_cents: 5000,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita despesa sem metodo de pagamento', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'expense',
      payment_method: undefined,
      amount_cents: -1500,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita despesa com valor positivo', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'expense',
      payment_method: 'debit',
      amount_cents: 1500,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita receita com metodo de pagamento', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'income',
      payment_method: 'credit',
      amount_cents: 1500,
    })

    expect(result.success).toBe(false)
  })

  it('rejeita receita com valor negativo', () => {
    const result = transactionSchema.safeParse({
      ...base,
      type: 'income',
      payment_method: undefined,
      amount_cents: -1500,
    })

    expect(result.success).toBe(false)
  })
})
