import { describe, expect, it } from 'vitest'
import { AtomicOperationError, createAtomicOperationError } from '~/utils/atomic-error'

describe('utils/atomic-error', () => {
  it('createAtomicOperationError cria erro com metadados de etapa e rollback', () => {
    const error = createAtomicOperationError({
      stage: 'delete_account_cascade',
      message: 'falha durante delecao',
      rollbackApplied: true,
    })

    expect(error).toBeInstanceOf(AtomicOperationError)
    expect(error.name).toBe('AtomicOperationError')
    expect(error.message).toBe('falha durante delecao')
    expect(error.stage).toBe('delete_account_cascade')
    expect(error.rollbackApplied).toBe(true)
  })

  it('AtomicOperationError preserva contrato de Error nativo', () => {
    const error = new AtomicOperationError({
      stage: 'adjust_balance',
      message: 'saldo inconsistente',
      rollbackApplied: false,
    })

    expect(error instanceof Error).toBe(true)
    expect(error).toBeInstanceOf(AtomicOperationError)
    expect(error.stage).toBe('adjust_balance')
    expect(error.rollbackApplied).toBe(false)
  })
})
