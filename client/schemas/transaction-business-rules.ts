import type { ZodIssueCode } from 'zod'

export interface TransactionBusinessInput {
  accountId: number
  destinationAccountId?: number
  type: 'expense' | 'income' | 'transfer'
  payment_method?: 'debit' | 'credit'
  amount_cents: number
}

interface TransactionBusinessIssue {
  path: Array<string | number>
  message: string
  code?: ZodIssueCode
}

export function getTransactionBusinessIssues(tx: TransactionBusinessInput): TransactionBusinessIssue[] {
  const issues: TransactionBusinessIssue[] = []

  if (tx.type === 'transfer') {
    if (tx.destinationAccountId == null) {
      issues.push({
        path: ['destinationAccountId'],
        message: 'Transferencia exige conta de destino.',
      })
    } else if (tx.destinationAccountId === tx.accountId) {
      issues.push({
        path: ['destinationAccountId'],
        message: 'Conta de destino deve ser diferente da conta de origem.',
      })
    }

    if (tx.payment_method === 'credit') {
      issues.push({
        path: ['payment_method'],
        message: 'Transferencia nao pode usar pagamento no credito.',
      })
    }

    if (tx.amount_cents >= 0) {
      issues.push({
        path: ['amount_cents'],
        message: 'Transferencia deve ter valor negativo na conta de origem.',
      })
    }
  }

  if (tx.type === 'expense') {
    if (tx.destinationAccountId != null) {
      issues.push({
        path: ['destinationAccountId'],
        message: 'Despesa nao deve informar conta de destino.',
      })
    }

    if (!tx.payment_method) {
      issues.push({
        path: ['payment_method'],
        message: 'Despesa exige metodo de pagamento (debit ou credit).',
      })
    }

    if (tx.amount_cents >= 0) {
      issues.push({
        path: ['amount_cents'],
        message: 'Despesa deve ter valor negativo.',
      })
    }
  }

  if (tx.type === 'income') {
    if (tx.destinationAccountId != null) {
      issues.push({
        path: ['destinationAccountId'],
        message: 'Receita nao deve informar conta de destino.',
      })
    }

    if (tx.payment_method != null) {
      issues.push({
        path: ['payment_method'],
        message: 'Receita nao deve informar metodo de pagamento.',
      })
    }

    if (tx.amount_cents <= 0) {
      issues.push({
        path: ['amount_cents'],
        message: 'Receita deve ter valor positivo.',
      })
    }
  }

  return issues
}

export function assertTransactionBusinessRules(tx: TransactionBusinessInput) {
  const issues = getTransactionBusinessIssues(tx)
  if (!issues.length) return
  throw new Error(issues[0]?.message ?? 'Transacao invalida.')
}
