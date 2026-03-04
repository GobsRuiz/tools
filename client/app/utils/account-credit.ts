type CreditCardConfig = {
  card_closing_day?: number
  card_due_day?: number
}

export const CREDIT_CARD_PAIR_MESSAGE = 'Para cartão de crédito, informe o dia de fechamento e o dia de vencimento juntos.'
export const CREDIT_CARD_BLANK_MESSAGE = 'Se a conta não tem cartão, deixe os dois campos em branco.'

export function hasCompleteCreditCardConfig(account?: CreditCardConfig | null): boolean {
  return Number.isInteger(account?.card_closing_day) && Number.isInteger(account?.card_due_day)
}

export function hasPartialCreditCardConfig(account?: CreditCardConfig | null): boolean {
  const hasClosing = Number.isInteger(account?.card_closing_day)
  const hasDue = Number.isInteger(account?.card_due_day)
  return hasClosing !== hasDue
}

export function assertValidCreditCardPair(account?: CreditCardConfig | null) {
  if (hasPartialCreditCardConfig(account)) {
    throw new Error(`${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`)
  }
}

