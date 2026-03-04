import { z } from 'zod'
import { getTransactionBusinessIssues } from './transaction-business-rules'

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidISODate(date: string): boolean {
  const match = ISO_DATE_REGEX.exec(date)
  if (!match) return false

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false
  }

  if (month < 1 || month > 12) return false

  const parsed = new Date(Date.UTC(year, month - 1, day))
  return (
    parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() + 1 === month
    && parsed.getUTCDate() === day
  )
}

const isoDateSchema = z.string().refine(isValidISODate, 'Data invalida (YYYY-MM-DD)')

// Account
export const accountSchema = z.object({
  id: z.number().int().optional(),
  bank: z.string().min(1, 'Banco e obrigatorio'),
  label: z.string().min(1, 'Nome e obrigatorio'),
  type: z.literal('bank'),
  balance_cents: z.number().int(),
  card_closing_day: z.number().int().min(1).max(31).optional(),
  card_due_day: z.number().int().min(1).max(31).optional(),
}).refine(
  data => (data.card_closing_day === undefined) === (data.card_due_day === undefined),
  {
    message: 'Para cartao de credito, informe o dia de fechamento e o dia de vencimento juntos.',
    path: ['card_due_day'],
  },
)

export type Account = z.infer<typeof accountSchema> & { id: number }

// Installment
export const installmentSchema = z.object({
  parentId: z.string().uuid(),
  total: z.number().int().min(2, 'Minimo 2 parcelas'),
  index: z.number().int().min(1),
  product: z.string().min(1, 'Produto e obrigatorio'),
})

// Payment Method
export const paymentMethodSchema = z.enum(['debit', 'credit'])

// Transaction
export const transactionSchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.number().int({ message: 'Conta e obrigatoria' }),
  destinationAccountId: z.number().int().optional(),
  date: isoDateSchema,
  type: z.enum(['expense', 'income', 'transfer'], { message: 'Tipo e obrigatorio' }),
  payment_method: paymentMethodSchema.optional(),
  amount_cents: z.number().int(),
  description: z.string().optional(),
  paid: z.boolean().default(false),
  installment: installmentSchema.nullable().optional(),
  recurrentId: z.string().uuid().optional(),
  createdAt: isoDateSchema.optional(),
}).superRefine((data, ctx) => {
  const issues = getTransactionBusinessIssues(data)
  for (const issue of issues) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: issue.path,
      message: issue.message,
    })
  }
})

export type Transaction = z.infer<typeof transactionSchema> & { id: string }

// Recurrent
export const recurrentSchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.number().int({ message: 'Conta e obrigatoria' }),
  kind: z.enum(['income', 'expense'], { message: 'Tipo e obrigatorio' }),
  payment_method: paymentMethodSchema.optional(),
  notify: z.boolean().default(false),
  name: z.string().min(1, 'Nome e obrigatorio'),
  amount_cents: z.number().int(),
  frequency: z.literal('monthly'),
  day_of_month: z.number().int().min(1).max(31).optional(),
  due_day: z.number().int().min(1).max(31).optional(),
  description: z.string().optional(),
  active: z.boolean().default(true),
})

export type Recurrent = z.infer<typeof recurrentSchema> & { id: string }

export const investmentTypeSchema = z.enum([
  'fii',
  'cripto',
  'caixinha',
  'cdb',
  'cdi',
  'tesouro',
  'lci',
  'lca',
  'outro',
])

export const investmentIndexerSchema = z.enum(['CDI', 'IPCA', 'PRE', 'SELIC', 'OUTRO'])
export const investmentLiquiditySchema = z.enum(['D0', 'D1', 'NO_VENCIMENTO', 'OUTRA'])

// Investment Position / Events
export const investmentBucketSchema = z.enum(['variable', 'fixed'])

export const investmentPositionSchema = z.object({
  id: z.string().uuid().optional(),
  accountId: z.number().int({ message: 'Conta e obrigatoria' }),
  bucket: investmentBucketSchema,
  investment_type: investmentTypeSchema,
  asset_code: z.string().min(1, 'Codigo e obrigatorio'),
  name: z.string().optional(),
  is_active: z.boolean().default(true),
  quantity_total: z.number().nonnegative().optional(),
  avg_cost_cents: z.number().int().nonnegative().optional(),
  invested_cents: z.number().int().default(0),
  principal_cents: z.number().int().optional(),
  current_value_cents: z.number().int().optional(),
  metadata: z.object({
    issuer: z.string().optional(),
    indexer: investmentIndexerSchema.optional(),
    rate_mode: z.enum(['annual_percent', 'pct_cdi']).optional(),
    rate_percent: z.number().nonnegative().optional(),
    maturity_date: isoDateSchema.optional(),
    liquidity: investmentLiquiditySchema.optional(),
  }).optional(),
})

export type InvestmentPosition = z.infer<typeof investmentPositionSchema> & { id: string }

export const investmentEventTypeSchema = z.enum([
  'buy',
  'sell',
  'income',
  'contribution',
  'withdrawal',
  'maturity',
])

export const investmentEventSchema = z.object({
  id: z.string().uuid().optional(),
  positionId: z.string().uuid({ message: 'Posicao e obrigatoria' }),
  accountId: z.number().int({ message: 'Conta e obrigatoria' }),
  date: isoDateSchema,
  event_type: investmentEventTypeSchema,
  amount_cents: z.number().int().positive('Valor do evento deve ser maior que zero'),
  quantity: z.number().nonnegative().optional(),
  unit_price_cents: z.number().int().nonnegative().optional(),
  note: z.string().optional(),
}).strict('Evento de investimento contem campos nao suportados.')

export type InvestmentEvent = z.infer<typeof investmentEventSchema> & { id: string }
