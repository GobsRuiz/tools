const fs = require('fs')
const path = require('path')

let dbPath = null

const FALLBACK_COLLECTIONS = [
  'accounts',
  'transactions',
  'recurrents',
  'investment_positions',
  'investment_events',
]

let requiredCollections = [...FALLBACK_COLLECTIONS]

function getCollectionKeys(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return []
  }

  return Object.entries(data)
    .filter(([, value]) => Array.isArray(value))
    .map(([key]) => key)
}

function setRequiredCollectionsFromFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return

  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    const collectionKeys = getCollectionKeys(parsed)

    if (collectionKeys.length > 0) {
      requiredCollections = Array.from(new Set(collectionKeys))
    }
  } catch {
    // Keep previous list if the source file cannot be parsed.
  }
}

function createEmptyDB() {
  const emptyDb = {}
  for (const collection of requiredCollections) {
    emptyDb[collection] = []
  }
  return emptyDb
}

function normalizeDBShape(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { normalized: createEmptyDB(), changed: true }
  }

  const normalized = { ...data }
  let changed = false

  for (const collection of requiredCollections) {
    if (!Array.isArray(normalized[collection])) {
      normalized[collection] = []
      changed = true
    }
  }

  return { normalized, changed }
}

/**
 * Initializes db path.
 * PROD: userData (persistent outside app)
 * DEV: project root
 */
function init(userDataPath, isDev, resourcesPath) {
  if (isDev) {
    dbPath = path.join(__dirname, '..', 'db.json')
    setRequiredCollectionsFromFile(dbPath)
    return
  }

  dbPath = path.join(userDataPath, 'db.json')

  // Packaged: extraResources/db.json | Local build: ../db.json
  const templatePath = resourcesPath
    ? path.join(resourcesPath, 'db.json')
    : path.join(__dirname, '..', 'db.json')

  setRequiredCollectionsFromFile(templatePath)

  // If there is no db in userData yet, copy template when available.
  if (!fs.existsSync(dbPath)) {
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, dbPath)
    } else {
      const emptyDB = createEmptyDB()
      fs.writeFileSync(dbPath, JSON.stringify(emptyDB, null, 2), 'utf-8')
    }
  }

  setRequiredCollectionsFromFile(dbPath)
}

function readDB() {
  try {
    const raw = fs.readFileSync(dbPath, 'utf-8')
    const parsed = JSON.parse(raw)
    const dynamicCollectionKeys = getCollectionKeys(parsed)

    if (dynamicCollectionKeys.length > 0) {
      requiredCollections = Array.from(new Set([
        ...requiredCollections,
        ...dynamicCollectionKeys,
      ]))
    }

    const { normalized, changed } = normalizeDBShape(parsed)

    if (changed) {
      writeDB(normalized)
    }

    return normalized
  } catch {
    const emptyDB = createEmptyDB()
    writeDB(emptyDB)
    return emptyDB
  }
}

function writeDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
}

function writeDBAtomic(data) {
  const tempPath = `${dbPath}.tmp-${process.pid}-${Date.now()}`
  const backupPath = `${dbPath}.bak-${process.pid}-${Date.now()}`
  let backupCreated = false

  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8')

  try {
    if (fs.existsSync(dbPath)) {
      fs.renameSync(dbPath, backupPath)
      backupCreated = true
    }

    fs.renameSync(tempPath, dbPath)

    if (backupCreated && fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath)
    }
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath)
    }
    if (backupCreated && fs.existsSync(backupPath) && !fs.existsSync(dbPath)) {
      fs.renameSync(backupPath, dbPath)
    }
    throw error
  }
}

/**
 * Parses json-server style paths: "/accounts", "/accounts/1", "/transactions/tx-001"
 * Returns { collection, id }
 */
function parsePath(urlPath) {
  const parts = urlPath.replace(/^\//, '').split('/')
  const collection = parts[0]
  const id = parts[1] ?? null
  return { collection, id }
}

function buildIpcError(status, code, message) {
  return {
    __ipcError: {
      status,
      code,
      message,
    },
  }
}

class AtomicStageError extends Error {
  constructor(stage, message, auditTrail = []) {
    super(message)
    this.name = 'AtomicStageError'
    this.stage = stage
    this.auditTrail = auditTrail
  }
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function addDelta(map, accountId, delta) {
  if (accountId == null) return
  if (!Number.isFinite(delta) || delta === 0) return
  map.set(accountId, (map.get(accountId) ?? 0) + delta)
}

function applyAccountDeltas(db, accountDeltaMap) {
  for (const [accountId, delta] of accountDeltaMap.entries()) {
    if (!delta) continue
    const account = db.accounts.find(item => item.id === accountId)
    if (!account) continue

    account.balance_cents += delta
  }
}

function executeAtomicMutation(mutateFn) {
  const current = readDB()
  const next = deepClone(current)
  const result = mutateFn(next)
  writeDBAtomic(next)
  return result
}

function atomicDeleteAccountCascade(payload) {
  const accountId = Number(payload?.accountId)
  if (!Number.isFinite(accountId)) {
    throw new Error('accountId invalido para deleteAccountCascade.')
  }

  return executeAtomicMutation((db) => {
    const auditTrail = []

    function markStage(stage, count, message) {
      auditTrail.push({ stage, count, message })
    }

    const accountExists = db.accounts.some(account => account.id === accountId)
    if (!accountExists) {
      throw new AtomicStageError(
        'validate_account',
        `Conta ${accountId} nao encontrada.`,
        auditTrail,
      )
    }
    markStage('validate_account', 1, 'Conta encontrada para exclusao')

    const txMap = new Map()
    for (const tx of db.transactions) {
      if (tx.accountId === accountId || tx.destinationAccountId === accountId) {
        txMap.set(tx.id, tx)
      }
    }

    const positions = db.investment_positions.filter(position => position.accountId === accountId)
    const positionIds = new Set(positions.map(position => position.id))

    const eventsToDelete = new Map()
    for (const event of db.investment_events) {
      if (event.accountId === accountId || positionIds.has(event.positionId)) {
        eventsToDelete.set(event.id, event)
      }
    }

    const recurrents = db.recurrents.filter(rec => rec.accountId === accountId)
    markStage('collect_related_data', txMap.size + positions.length + eventsToDelete.size + recurrents.length)

    const accountDeltaMap = new Map()
    for (const tx of txMap.values()) {
      if (!tx.paid) continue
      addDelta(accountDeltaMap, tx.accountId, -tx.amount_cents)
      if (tx.type === 'transfer') {
        addDelta(accountDeltaMap, tx.destinationAccountId, tx.amount_cents)
      }
    }
    accountDeltaMap.delete(accountId)
    applyAccountDeltas(db, accountDeltaMap)
    markStage('recompose_balances', accountDeltaMap.size, 'Saldos recompostos para contas remanescentes')

    const txIds = new Set(Array.from(txMap.keys()))
    const eventIds = new Set(Array.from(eventsToDelete.keys()))
    const recurrentIds = new Set(recurrents.map(item => item.id))

    markStage('delete_transactions', txIds.size)
    db.transactions = db.transactions.filter(tx => !txIds.has(tx.id))
    markStage('delete_recurrents', recurrentIds.size)
    db.recurrents = db.recurrents.filter(rec => !recurrentIds.has(rec.id))
    markStage('delete_investment_events', eventIds.size)
    db.investment_events = db.investment_events.filter(event => !eventIds.has(event.id))
    markStage('delete_investment_positions', positions.length)
    db.investment_positions = db.investment_positions.filter(position => position.accountId !== accountId)
    markStage('delete_account', 1)
    db.accounts = db.accounts.filter(account => account.id !== accountId)
    markStage('done', 1, 'Exclusao em cascata concluida')

    return {
      transactionsDeleted: txIds.size,
      recurrentsDeleted: recurrentIds.size,
      investmentPositionsDeleted: positions.length,
      investmentEventsDeleted: eventIds.size,
      auditTrail,
    }
  })
}

function accountDeltaForInvestmentEvent(event) {
  if (event.event_type === 'buy' || event.event_type === 'contribution') {
    return -event.amount_cents
  }
  if (event.event_type === 'sell' || event.event_type === 'withdrawal' || event.event_type === 'maturity') {
    return event.amount_cents
  }
  return 0
}

function atomicDeletePositionCascade(payload) {
  const positionId = String(payload?.positionId ?? '')
  if (!positionId) {
    throw new Error('positionId invalido para deletePositionCascade.')
  }

  return executeAtomicMutation((db) => {
    const position = db.investment_positions.find(item => item.id === positionId)
    if (!position) {
      throw new Error(`Posicao ${positionId} nao encontrada.`)
    }

    const relatedEvents = db.investment_events.filter(event => event.positionId === positionId)
    const accountDeltaMap = new Map()

    for (const event of relatedEvents) {
      const reverseDelta = -accountDeltaForInvestmentEvent(event)
      addDelta(accountDeltaMap, event.accountId, reverseDelta)
    }

    applyAccountDeltas(db, accountDeltaMap)

    const eventIds = new Set(relatedEvents.map(event => event.id))
    db.investment_events = db.investment_events.filter(event => !eventIds.has(event.id))
    db.investment_positions = db.investment_positions.filter(item => item.id !== positionId)

    return {
      positionDeleted: 1,
      eventsDeleted: relatedEvents.length,
    }
  })
}

function atomicReplaceBackup(payload) {
  const data = payload?.data
  if (!data || typeof data !== 'object') {
    throw new Error('Payload invalido para replaceBackupData.')
  }

  return executeAtomicMutation((db) => {
    for (const collection of requiredCollections) {
      const incoming = data[collection]
      db[collection] = Array.isArray(incoming) ? deepClone(incoming) : []
    }

    return { replaced: true }
  })
}

function handleAtomic(action, payload) {
  try {
    if (action === 'deleteAccountCascade') {
      return atomicDeleteAccountCascade(payload)
    }
    if (action === 'deletePositionCascade') {
      return atomicDeletePositionCascade(payload)
    }
    if (action === 'replaceBackupData') {
      return atomicReplaceBackup(payload)
    }

    return buildIpcError(400, 'BAD_REQUEST', `Atomic action not supported: ${action}`)
  } catch (error) {
    if (error instanceof AtomicStageError) {
      const stageMessage = `[stage:${error.stage}] ${error.message}`
      const response = buildIpcError(500, 'ATOMIC_FAILED_STAGE', stageMessage)
      response.__ipcError.stage = error.stage
      response.__ipcError.auditTrail = error.auditTrail
      return response
    }

    const message = error instanceof Error ? error.message : String(error)
    return buildIpcError(500, 'ATOMIC_FAILED', message)
  }
}

/**
 * GET - returns full collection or item by id
 * Supports basic equality filters via query params
 */
function handleGet(urlPath, params) {
  const db = readDB()
  const { collection, id } = parsePath(urlPath)

  if (!db[collection]) return id ? null : []

  if (id) {
    // Match by id (number or string)
    return db[collection].find(item => String(item.id) === String(id)) ?? null
  }

  let items = [...db[collection]]

  // Query param filters (json-server-like equality)
  if (params && typeof params === 'object') {
    for (const [key, value] of Object.entries(params)) {
      items = items.filter(item => String(item[key]) === String(value))
    }
  }

  return items
}

/**
 * POST - inserts item into collection
 * For accounts: auto-increment numeric id
 * For others: keeps id from body (UUID)
 */
function handlePost(urlPath, body) {
  const db = readDB()
  const { collection } = parsePath(urlPath)

  if (!db[collection]) db[collection] = []

  // Auto-increment for accounts
  if (collection === 'accounts' && !body.id) {
    const maxId = db[collection].reduce(
      (max, item) => (typeof item.id === 'number' && item.id > max ? item.id : max),
      0,
    )
    body.id = maxId + 1
  }

  db[collection].push(body)
  writeDB(db)
  return body
}

/**
 * PATCH - updates item by id
 */
function handlePatch(urlPath, body) {
  const db = readDB()
  const { collection, id } = parsePath(urlPath)

  if (!db[collection] || !id) {
    return buildIpcError(404, 'NOT_FOUND', `Resource not found: ${urlPath}`)
  }

  const index = db[collection].findIndex(item => String(item.id) === String(id))

  if (index === -1) {
    return buildIpcError(404, 'NOT_FOUND', `Resource not found: ${urlPath}`)
  }

  db[collection][index] = { ...db[collection][index], ...body }
  writeDB(db)
  return db[collection][index]
}

/**
 * DELETE - removes item by id
 */
function handleDelete(urlPath) {
  const db = readDB()
  const { collection, id } = parsePath(urlPath)

  if (!db[collection] || !id) {
    return buildIpcError(404, 'NOT_FOUND', `Resource not found: ${urlPath}`)
  }

  const index = db[collection].findIndex(item => String(item.id) === String(id))

  if (index === -1) {
    return buildIpcError(404, 'NOT_FOUND', `Resource not found: ${urlPath}`)
  }

  const [removed] = db[collection].splice(index, 1)
  writeDB(db)
  return removed
}

module.exports = { init, handleGet, handlePost, handlePatch, handleDelete, handleAtomic }
