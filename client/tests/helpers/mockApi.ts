import { vi } from 'vitest'

export interface MockApiDb {
  accounts: any[]
  transactions: any[]
  recurrents: any[]
  history: any[]
  investment_positions: any[]
  investment_events: any[]
}

type PartialMockApiDb = Partial<MockApiDb>
type CollectionKey = keyof MockApiDb

const EMPTY_DB: MockApiDb = {
  accounts: [],
  transactions: [],
  recurrents: [],
  history: [],
  investment_positions: [],
  investment_events: [],
}

let db: MockApiDb = normalizeDb()

function clone<T>(value: T): T {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

function normalizeDb(seed: PartialMockApiDb = {}): MockApiDb {
  return {
    accounts: clone(seed.accounts ?? []),
    transactions: clone(seed.transactions ?? []),
    recurrents: clone(seed.recurrents ?? []),
    history: clone(seed.history ?? []),
    investment_positions: clone(seed.investment_positions ?? []),
    investment_events: clone(seed.investment_events ?? []),
  }
}

function parsePath(path: string): { collection: CollectionKey, id?: string } {
  const cleanPath = path.split('?')[0] ?? path
  const match = /^\/([^/]+)(?:\/([^/]+))?$/.exec(cleanPath)
  if (!match) throw new Error(`Invalid mock API path: ${path}`)

  const collection = match[1] as CollectionKey
  if (!(collection in EMPTY_DB)) {
    throw new Error(`Unsupported mock API collection: ${collection}`)
  }

  return { collection, id: match[2] }
}

function itemMatchesParams(item: Record<string, any>, params?: Record<string, string>) {
  if (!params) return true
  return Object.entries(params).every(([key, value]) => String(item[key]) === value)
}

function findById(collection: CollectionKey, id: string) {
  const rows = db[collection]
  const index = rows.findIndex(row => String(row.id) === String(id))
  return { rows, index }
}

export const apiGetMock = vi.fn(async <T>(path: string, params?: Record<string, string>): Promise<T> => {
  const { collection, id } = parsePath(path)
  const rows = db[collection]

  if (id) {
    const item = rows.find(row => String(row.id) === String(id))
    if (!item) {
      throw new Error(`Mock API GET not found: ${path}`)
    }
    return clone(item) as T
  }

  const filtered = rows.filter(row => itemMatchesParams(row, params))
  return clone(filtered) as T
})

export const apiPostMock = vi.fn(async <T>(path: string, body: unknown): Promise<T> => {
  const { collection, id } = parsePath(path)
  if (id) {
    throw new Error(`Mock API POST does not support item path: ${path}`)
  }

  const item = clone(body) as Record<string, any>
  if (!item.id) {
    item.id = `mock-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  db[collection].push(item)
  return clone(item) as T
})

export const apiPatchMock = vi.fn(async <T>(path: string, body: unknown): Promise<T> => {
  const { collection, id } = parsePath(path)
  if (!id) {
    throw new Error(`Mock API PATCH requires an item id: ${path}`)
  }

  const { rows, index } = findById(collection, id)
  if (index === -1) {
    throw new Error(`Mock API PATCH not found: ${path}`)
  }

  const current = rows[index] as Record<string, any>
  const patch = body as Record<string, any>
  const updated = { ...current, ...clone(patch) }
  rows[index] = updated
  return clone(updated) as T
})

export const apiDeleteMock = vi.fn(async <T = void>(path: string): Promise<T> => {
  const { collection, id } = parsePath(path)
  if (!id) {
    throw new Error(`Mock API DELETE requires an item id: ${path}`)
  }

  const { rows, index } = findById(collection, id)
  if (index === -1) {
    return undefined as T
  }

  rows.splice(index, 1)
  return undefined as T
})

export const apiAtomicMock = vi.fn(async <T>(action: string): Promise<T> => {
  throw new Error(`Mock API atomic not configured for action: ${action}`)
})

export const mockedApiModule = {
  apiGet: apiGetMock,
  apiPost: apiPostMock,
  apiPatch: apiPatchMock,
  apiDelete: apiDeleteMock,
  apiAtomic: apiAtomicMock,
}

export function resetMockApi(seed: PartialMockApiDb = {}) {
  db = normalizeDb(seed)
  apiGetMock.mockClear()
  apiPostMock.mockClear()
  apiPatchMock.mockClear()
  apiDeleteMock.mockClear()
  apiAtomicMock.mockClear()
}

export function getMockDb() {
  return db
}
