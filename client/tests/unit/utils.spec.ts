import { describe, expect, it } from 'vitest'
import { formatMonthYearLabelPtBr, monthKey } from '~/utils/dates'
import { computeCreditInvoiceCycleMonth, computeCreditInvoiceDueDate } from '~/utils/invoice-cycle'
import { formatCentsToBRL, parseBRLToCents } from '~/utils/money'
import {
  isPendingDebitExpenseTransaction,
  isPendingDebitExpenseTransactionForMonth,
} from '~/utils/pending-transactions'

describe('utils/invoice-cycle', () => {
  it('calcula vencimento da fatura no mes seguinte quando due_day <= closing_day', () => {
    const dueDate = computeCreditInvoiceDueDate('2026-02-27', 3, 28)
    expect(dueDate).toBe('2026-03-03')
  })

  it('compra no dia do fechamento entra no proximo ciclo', () => {
    const dueDate = computeCreditInvoiceDueDate('2026-02-28', 3, 28)
    expect(dueDate).toBe('2026-04-03')
  })

  it('retorna null para data invalida', () => {
    const dueDate = computeCreditInvoiceDueDate('invalida', 10, 20)
    expect(dueDate).toBeNull()
  })

  it('calcula o mes do ciclo de fechamento corretamente', () => {
    expect(computeCreditInvoiceCycleMonth('2026-02-27', 28)).toBe('2026-02')
    expect(computeCreditInvoiceCycleMonth('2026-02-28', 28)).toBe('2026-03')
  })
})

describe('utils/dates', () => {
  it('retorna monthKey no formato YYYY-MM', () => {
    expect(monthKey('2026-02-27')).toBe('2026-02')
  })

  it('formata label de mes em pt-BR', () => {
    expect(formatMonthYearLabelPtBr('2026-03')).toBe('Março 2026')
    expect(formatMonthYearLabelPtBr('2026-01')).toBe('Janeiro 2026')
  })
})

describe('utils/money', () => {
  it('parseia formatos pt-BR e ponto decimal sem inflar em 100x', () => {
    expect(parseBRLToCents('1.234,56')).toBe(123456)
    expect(parseBRLToCents('1234,56')).toBe(123456)
    expect(parseBRLToCents('1234.56')).toBe(123456)
    expect(parseBRLToCents('R$ 1.234,56')).toBe(123456)
    expect(parseBRLToCents('0,99')).toBe(99)
    expect(parseBRLToCents('0,01')).toBe(1)
  })

  it('mantem compatibilidade para inteiros e separador de milhar', () => {
    expect(parseBRLToCents('1234')).toBe(123400)
    expect(parseBRLToCents('1.234')).toBe(123400)
    expect(parseBRLToCents('1,234')).toBe(123400)
  })

  it('retorna 0 para entradas invalidas', () => {
    expect(parseBRLToCents('')).toBe(0)
    expect(parseBRLToCents('abc')).toBe(0)
  })

  it('formata centavos para BRL', () => {
    expect(formatCentsToBRL(123456)).toBe('R$\u00a01.234,56')
    expect(formatCentsToBRL(-123456)).toBe('-R$\u00a01.234,56')
  })
})

describe('utils/pending-transactions', () => {
  it('considera pendencia avulsa apenas para despesa em debito (nao credito/transferencia)', () => {
    const expenseDebit = {
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -12000,
    } as const

    const transfer = {
      date: '2026-03-10',
      type: 'transfer',
      payment_method: undefined,
      amount_cents: -5000,
    } as const

    const expenseCredit = {
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'credit',
      amount_cents: -7000,
    } as const

    const recurrentExpense = {
      date: '2026-03-10',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -4500,
      recurrentId: 'rec-1',
    } as const

    expect(isPendingDebitExpenseTransaction(expenseDebit)).toBe(true)
    expect(isPendingDebitExpenseTransaction(transfer as any)).toBe(false)
    expect(isPendingDebitExpenseTransaction(expenseCredit)).toBe(false)
    expect(isPendingDebitExpenseTransaction(recurrentExpense)).toBe(false)
  })

  it('filtra por mes sem incluir transferencia da conta de origem', () => {
    const month = '2026-03'

    const validExpense = {
      date: '2026-03-15',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -3000,
    } as const

    const transfer = {
      date: '2026-03-16',
      type: 'transfer',
      amount_cents: -9000,
    } as const

    const otherMonthExpense = {
      date: '2026-02-28',
      type: 'expense',
      payment_method: 'debit',
      amount_cents: -3000,
    } as const

    expect(isPendingDebitExpenseTransactionForMonth(validExpense, month)).toBe(true)
    expect(isPendingDebitExpenseTransactionForMonth(transfer as any, month)).toBe(false)
    expect(isPendingDebitExpenseTransactionForMonth(otherMonthExpense, month)).toBe(false)
  })
})
