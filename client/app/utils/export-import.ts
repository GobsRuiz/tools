import { z } from 'zod'
import {
  accountSchema,
  investmentEventSchema,
  investmentPositionSchema,
  recurrentSchema,
  transactionSchema,
} from '~~/schemas/zod-schemas'
import type {
  Account,
  InvestmentEvent,
  InvestmentPosition,
  Recurrent,
  Transaction,
} from '~~/schemas/zod-schemas'
import { nowISO } from '~/utils/dates'
import { apiAtomic, apiDelete, apiGet, apiPost } from '~/utils/api'

export interface BackupData {
  accounts: Account[]
  transactions: Transaction[]
  recurrents: Recurrent[]
  investment_positions: InvestmentPosition[]
  investment_events: InvestmentEvent[]
}

export interface BackupEnvelope {
  version: number
  exported_at: string
  data: BackupData
}

const COLLECTIONS = [
  { key: 'accounts', path: '/accounts' },
  { key: 'transactions', path: '/transactions' },
  { key: 'recurrents', path: '/recurrents' },
  { key: 'investment_positions', path: '/investment_positions' },
  { key: 'investment_events', path: '/investment_events' },
] as const

type CollectionKey = (typeof COLLECTIONS)[number]['key']

export type BackupCollectionKey = CollectionKey

export interface ExportBackupProgressEvent {
  stage: 'collecting-data' | 'generating-file' | 'completed'
}

export interface ReplaceBackupProgressEvent {
  stage: 'validating' | 'collecting-current' | 'deleting-collection' | 'inserting-collection' | 'completed'
  collectionKey?: BackupCollectionKey
  collectionIndex?: number
  collectionTotal?: number
}

interface ExportBackupOptions {
  onProgress?: (event: ExportBackupProgressEvent) => void
}

interface ReplaceBackupOptions {
  onProgress?: (event: ReplaceBackupProgressEvent) => void
}

function createPersistedSchema(baseSchema: z.ZodTypeAny, idSchema: z.ZodTypeAny) {
  return z.object({ id: idSchema }).passthrough().superRefine((data, ctx) => {
    const parsed = baseSchema.safeParse(data)
    if (parsed.success) return

    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
      })
    }
  })
}

const persistedAccountSchema = createPersistedSchema(accountSchema, z.number().int())
const persistedTransactionSchema = createPersistedSchema(transactionSchema, z.string().uuid())
const persistedRecurrentSchema = createPersistedSchema(recurrentSchema, z.string().uuid())
const persistedPositionSchema = createPersistedSchema(investmentPositionSchema, z.string().uuid())
const persistedEventSchema = createPersistedSchema(investmentEventSchema, z.string().uuid())

const backupDataSchema = z.object({
  accounts: z.array(persistedAccountSchema),
  transactions: z.array(persistedTransactionSchema),
  recurrents: z.array(persistedRecurrentSchema),
  investment_positions: z.array(persistedPositionSchema).default([]),
  investment_events: z.array(persistedEventSchema).default([]),
})

const backupEnvelopeSchema = z.object({
  version: z.number().int().positive(),
  exported_at: z.string().min(1),
  data: backupDataSchema,
}).passthrough()

export const EMPTY_BACKUP_DATA: BackupData = {
  accounts: [],
  transactions: [],
  recurrents: [],
  investment_positions: [],
  investment_events: [],
}

function ensureBrowserEnvironment() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('Recurso disponivel apenas no navegador.')
  }
}

function downloadTextFile(content: string, filename: string, mimeType: string) {
  ensureBrowserEnvironment()

  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  window.URL.revokeObjectURL(url)
}

function formatValidationError(error: z.ZodError) {
  const details = error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : 'raiz'
      return `${path}: ${issue.message}`
    })
    .join(' | ')

  return details || 'Estrutura invalida.'
}

function collectDuplicateIdErrors<T extends { id: string | number }>(items: T[], label: string) {
  const seen = new Set<string>()
  const errors: string[] = []

  items.forEach((item, index) => {
    const id = String(item.id)
    if (seen.has(id)) {
      errors.push(`${label}[${index}] possui id duplicado (${id}).`)
      return
    }
    seen.add(id)
  })

  return errors
}

function validateRelations(data: BackupData) {
  const errors: string[] = []

  errors.push(...collectDuplicateIdErrors(data.accounts, 'accounts'))
  errors.push(...collectDuplicateIdErrors(data.transactions, 'transactions'))
  errors.push(...collectDuplicateIdErrors(data.recurrents, 'recurrents'))
  errors.push(...collectDuplicateIdErrors(data.investment_positions, 'investment_positions'))
  errors.push(...collectDuplicateIdErrors(data.investment_events, 'investment_events'))

  const accountIds = new Set(data.accounts.map(account => account.id))
  const positionIds = new Set(data.investment_positions.map(position => position.id))
  const recurrentIds = new Set(data.recurrents.map(recurrent => recurrent.id))
  const positionAccountById = new Map(data.investment_positions.map(position => [position.id, position.accountId]))

  data.transactions.forEach((tx, index) => {
    if (!accountIds.has(tx.accountId)) {
      errors.push(`transactions[${index}] referencia conta inexistente (${tx.accountId}).`)
    }
    if (tx.destinationAccountId != null && !accountIds.has(tx.destinationAccountId)) {
      errors.push(`transactions[${index}] referencia conta destino inexistente (${tx.destinationAccountId}).`)
    }
    if (tx.recurrentId && !recurrentIds.has(tx.recurrentId)) {
      errors.push(`transactions[${index}] referencia recorrente inexistente (${tx.recurrentId}).`)
    }
  })

  data.recurrents.forEach((rec, index) => {
    if (!accountIds.has(rec.accountId)) {
      errors.push(`recurrents[${index}] referencia conta inexistente (${rec.accountId}).`)
    }
  })

  data.investment_positions.forEach((position, index) => {
    if (!accountIds.has(position.accountId)) {
      errors.push(`investment_positions[${index}] referencia conta inexistente (${position.accountId}).`)
    }
  })

  data.investment_events.forEach((event, index) => {
    if (!positionIds.has(event.positionId)) {
      errors.push(`investment_events[${index}] referencia posicao inexistente (${event.positionId}).`)
    }
    if (!accountIds.has(event.accountId)) {
      errors.push(`investment_events[${index}] referencia conta inexistente (${event.accountId}).`)
    }
    const positionAccountId = positionAccountById.get(event.positionId)
    if (positionAccountId != null && positionAccountId !== event.accountId) {
      errors.push(`investment_events[${index}] conta (${event.accountId}) difere da conta da posicao (${positionAccountId}).`)
    }
  })

  if (!errors.length) return

  const limit = 10
  const preview = errors.slice(0, limit).join('\n')
  const suffix = errors.length > limit
    ? `\n... e mais ${errors.length - limit} erro(s).`
    : ''

  throw new Error(`Arquivo invalido:\n${preview}${suffix}`)
}

function resolveBackupData(raw: unknown): BackupData {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Arquivo invalido: JSON deve ser um objeto.')
  }

  const envelopeParsed = backupEnvelopeSchema.safeParse(raw)
  if (envelopeParsed.success) {
    return envelopeParsed.data.data as BackupData
  }

  if ('data' in raw) {
    const nestedParsed = backupDataSchema.safeParse((raw as { data: unknown }).data)
    if (nestedParsed.success) {
      return nestedParsed.data as BackupData
    }

    throw new Error(`Arquivo invalido: ${formatValidationError(nestedParsed.error)}`)
  }

  const dataParsed = backupDataSchema.safeParse(raw)
  if (!dataParsed.success) {
    throw new Error(`Arquivo invalido: ${formatValidationError(dataParsed.error)}`)
  }

  return dataParsed.data as BackupData
}

export function parseBackupFileContent(fileContent: string): BackupData {
  let parsed: unknown

  try {
    parsed = JSON.parse(fileContent)
  } catch {
    throw new Error('Arquivo invalido: nao foi possivel ler JSON.')
  }

  const data = resolveBackupData(parsed)
  validateRelations(data)

  return data
}

export async function collectBackupData(): Promise<BackupData> {
  const [accounts, transactions, recurrents, investmentPositions, investmentEvents] = await Promise.all([
    apiGet<Account[]>('/accounts'),
    apiGet<Transaction[]>('/transactions'),
    apiGet<Recurrent[]>('/recurrents'),
    apiGet<InvestmentPosition[]>('/investment_positions'),
    apiGet<InvestmentEvent[]>('/investment_events'),
  ])

  return {
    accounts,
    transactions,
    recurrents,
    investment_positions: investmentPositions,
    investment_events: investmentEvents,
  }
}

export async function exportBackupJson(options: ExportBackupOptions = {}) {
  options.onProgress?.({ stage: 'collecting-data' })
  const data = await collectBackupData()
  options.onProgress?.({ stage: 'generating-file' })

  const backup: BackupEnvelope = {
    version: 1,
    exported_at: new Date().toISOString(),
    data,
  }

  const filename = `financeiro-backup-${nowISO()}.json`
  downloadTextFile(JSON.stringify(backup, null, 2), filename, 'application/json')
  options.onProgress?.({ stage: 'completed' })

  return filename
}

export async function replaceDataWithBackup(data: BackupData, options: ReplaceBackupOptions = {}) {
  options.onProgress?.({ stage: 'validating' })
  validateRelations(data)

  const canUseAtomicIpc = typeof window !== 'undefined' && !!window.electronAPI?.atomic
  if (canUseAtomicIpc) {
    options.onProgress?.({ stage: 'collecting-current' })
    await apiAtomic('replaceBackupData', { data })
    options.onProgress?.({ stage: 'completed' })
    return
  }

  options.onProgress?.({ stage: 'collecting-current' })
  const currentData = await collectBackupData()

  const deleteOrder: Array<(typeof COLLECTIONS)[number]> = [
    COLLECTIONS[1], // transactions
    COLLECTIONS[2], // recurrents
    COLLECTIONS[4], // investment_events
    COLLECTIONS[3], // investment_positions
    COLLECTIONS[0], // accounts
  ]

  for (const [index, collection] of deleteOrder.entries()) {
    options.onProgress?.({
      stage: 'deleting-collection',
      collectionKey: collection.key,
      collectionIndex: index + 1,
      collectionTotal: deleteOrder.length,
    })
    const items = currentData[collection.key]
    await Promise.all(items.map(item => apiDelete(`${collection.path}/${item.id}`)))
  }

  const insertOrder: Array<(typeof COLLECTIONS)[number]> = [
    COLLECTIONS[0], // accounts
    COLLECTIONS[1], // transactions
    COLLECTIONS[2], // recurrents
    COLLECTIONS[3], // investment_positions
    COLLECTIONS[4], // investment_events
  ]

  for (const [index, collection] of insertOrder.entries()) {
    options.onProgress?.({
      stage: 'inserting-collection',
      collectionKey: collection.key,
      collectionIndex: index + 1,
      collectionTotal: insertOrder.length,
    })
    const items = data[collection.key]
    await Promise.all(items.map(item => apiPost(collection.path, item)))
  }

  options.onProgress?.({ stage: 'completed' })
}

export function summarizeBackup(data: BackupData) {
  return {
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    recurrents: data.recurrents.length,
    investmentPositions: data.investment_positions.length,
    investmentEvents: data.investment_events.length,
  }
}
