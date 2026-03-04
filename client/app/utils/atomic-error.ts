export interface AtomicErrorPayload {
  stage: string
  message: string
  rollbackApplied: boolean
}

export class AtomicOperationError extends Error {
  stage: string
  rollbackApplied: boolean

  constructor(payload: AtomicErrorPayload) {
    super(payload.message)
    this.name = 'AtomicOperationError'
    this.stage = payload.stage
    this.rollbackApplied = payload.rollbackApplied
  }
}

export function createAtomicOperationError(payload: AtomicErrorPayload): AtomicOperationError {
  return new AtomicOperationError(payload)
}

