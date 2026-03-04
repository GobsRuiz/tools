import { monthKey } from '~/utils/dates'

type PendingTransactionLike = {
  date: string
  type: 'expense' | 'income' | 'transfer'
  payment_method?: 'debit' | 'credit'
  amount_cents: number
  recurrentId?: string
}

export function isPendingDebitExpenseTransaction(tx: PendingTransactionLike) {
  return tx.type === 'expense'
    && tx.amount_cents < 0
    && tx.payment_method !== 'credit'
    && !tx.recurrentId
}

export function isPendingDebitExpenseTransactionForMonth(
  tx: PendingTransactionLike,
  month: string,
) {
  return monthKey(tx.date) === month && isPendingDebitExpenseTransaction(tx)
}
