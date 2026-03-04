import { describe, expect, it } from 'vitest'
import {
  assertValidCreditCardPair,
  CREDIT_CARD_BLANK_MESSAGE,
  CREDIT_CARD_PAIR_MESSAGE,
  hasCompleteCreditCardConfig,
  hasPartialCreditCardConfig,
} from '~/utils/account-credit'

describe('utils/account-credit', () => {
  it('identifica configuracao completa de cartao', () => {
    expect(hasCompleteCreditCardConfig({ card_closing_day: 8, card_due_day: 15 })).toBe(true)
    expect(hasCompleteCreditCardConfig({ card_closing_day: 8 })).toBe(false)
    expect(hasCompleteCreditCardConfig({ card_due_day: 15 })).toBe(false)
    expect(hasCompleteCreditCardConfig(undefined)).toBe(false)
  })

  it('identifica configuracao parcial (apenas um dos campos)', () => {
    expect(hasPartialCreditCardConfig({ card_closing_day: 8 })).toBe(true)
    expect(hasPartialCreditCardConfig({ card_due_day: 15 })).toBe(true)
    expect(hasPartialCreditCardConfig({ card_closing_day: 8, card_due_day: 15 })).toBe(false)
    expect(hasPartialCreditCardConfig({})).toBe(false)
  })

  it('assertValidCreditCardPair aceita ambos preenchidos ou ambos vazios', () => {
    expect(() => assertValidCreditCardPair({ card_closing_day: 8, card_due_day: 15 })).not.toThrow()
    expect(() => assertValidCreditCardPair({})).not.toThrow()
    expect(() => assertValidCreditCardPair(undefined)).not.toThrow()
  })

  it('assertValidCreditCardPair rejeita configuracao parcial com mensagem orientativa', () => {
    expect(() => assertValidCreditCardPair({ card_closing_day: 8 })).toThrow(
      `${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`,
    )
    expect(() => assertValidCreditCardPair({ card_due_day: 15 })).toThrow(
      `${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`,
    )
  })
})
