import { beforeEach, describe, expect, it } from 'vitest'
import {
  parseBackupFileContent,
  replaceDataWithBackup,
  summarizeBackup,
} from '~/utils/export-import'
import { apiAtomicMock, getMockDb, resetMockApi } from '../helpers/mockApi'

function makeValidBackup() {
  return {
    version: 1,
    exported_at: '2026-03-04T10:00:00.000Z',
    data: {
      accounts: [
        { id: 1, bank: 'Banco A', label: 'Conta A', type: 'bank', balance_cents: 100000 },
      ],
      transactions: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          accountId: 1,
          date: '2026-03-01',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          paid: true,
          installment: null,
          recurrentId: '22222222-2222-4222-8222-222222222222',
          createdAt: '2026-03-01',
        },
      ],
      recurrents: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          accountId: 1,
          kind: 'expense',
          payment_method: 'debit',
          notify: false,
          name: 'Internet',
          amount_cents: -1000,
          frequency: 'monthly',
          due_day: 10,
          active: true,
        },
      ],
      investment_positions: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          accountId: 1,
          bucket: 'variable',
          investment_type: 'fii',
          asset_code: 'HGLG11',
          is_active: true,
          invested_cents: 0,
        },
      ],
      investment_events: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          positionId: '33333333-3333-4333-8333-333333333333',
          accountId: 1,
          date: '2026-03-01',
          event_type: 'buy',
          amount_cents: 1000,
        },
      ],
      history: [
        {
          id: '55555555-5555-4555-8555-555555555555',
          accountId: 1,
          date: '2026-03-01',
          balance_cents: 100000,
        },
      ],
    },
  }
}

describe('export-import relation validation', () => {
  beforeEach(() => {
    resetMockApi({
      accounts: [
        { id: 9, bank: 'Banco Legado', label: 'Conta Legada', type: 'bank', balance_cents: 5000 },
      ],
      transactions: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          accountId: 9,
          date: '2026-02-01',
          type: 'expense',
          payment_method: 'debit',
          amount_cents: -1000,
          paid: true,
          installment: null,
          createdAt: '2026-02-01',
        },
      ],
      recurrents: [],
      investment_positions: [],
      investment_events: [],
    })
  })

  it('rejeita transacao com recurrentId inexistente', () => {
    const backup = makeValidBackup()
    backup.data.transactions[0]!.recurrentId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

    expect(() => parseBackupFileContent(JSON.stringify(backup))).toThrow(
      'transactions[0] referencia recorrente inexistente (aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa).',
    )
  })

  it('rejeita evento com conta diferente da conta da posicao', () => {
    const backup = makeValidBackup()
    backup.data.accounts.push({ id: 2, bank: 'Banco B', label: 'Conta B', type: 'bank', balance_cents: 0 })
    backup.data.investment_events[0]!.accountId = 2

    expect(() => parseBackupFileContent(JSON.stringify(backup))).toThrow(
      'investment_events[0] conta (2) difere da conta da posicao (1).',
    )
  })

  it('rejeita transacao de transferencia sem conta de destino', () => {
    const backup = makeValidBackup()
    backup.data.transactions[0] = {
      id: '66666666-6666-4666-8666-666666666666',
      accountId: 1,
      date: '2026-03-01',
      type: 'transfer',
      payment_method: undefined,
      amount_cents: -1000,
      paid: true,
      installment: null,
      createdAt: '2026-03-01',
    } as any

    expect(() => parseBackupFileContent(JSON.stringify(backup))).toThrow('Transferencia exige conta de destino.')
  })

  it('rejeita evento de investimento com fees_cents (campo removido)', () => {
    const backup = makeValidBackup()
    ;(backup.data.investment_events[0] as any).fees_cents = 123

    expect(() => parseBackupFileContent(JSON.stringify(backup))).toThrow('campos nao suportados')
  })

  it('rejeita ids duplicados dentro da mesma colecao', () => {
    const backup = makeValidBackup()
    backup.data.accounts.push({
      id: 1,
      bank: 'Banco duplicado',
      label: 'Conta duplicada',
      type: 'bank',
      balance_cents: 0,
    })

    expect(() => parseBackupFileContent(JSON.stringify(backup))).toThrow(
      'accounts[1] possui id duplicado (1).',
    )
  })

  it('aceita payload sem envelope quando estrutura de dados eh valida', () => {
    const backup = makeValidBackup()
    const parsed = parseBackupFileContent(JSON.stringify(backup.data))
    expect(parsed.accounts).toHaveLength(1)
    expect(parsed.transactions).toHaveLength(1)
  })

  it('replaceDataWithBackup substitui todas as colecoes no modo HTTP com progresso completo', async () => {
    const backup = makeValidBackup()
    const progress: string[] = []

    await replaceDataWithBackup(backup.data as any, {
      onProgress: (event) => {
        const detail = event.collectionKey ? `:${event.collectionKey}` : ''
        progress.push(`${event.stage}${detail}`)
      },
    })

    const db = getMockDb()
    expect(db.accounts.map(item => item.id)).toEqual([1])
    expect(db.transactions.map(item => item.id)).toEqual(['11111111-1111-4111-8111-111111111111'])
    expect(db.recurrents.map(item => item.id)).toEqual(['22222222-2222-4222-8222-222222222222'])
    expect(db.investment_positions.map(item => item.id)).toEqual(['33333333-3333-4333-8333-333333333333'])
    expect(db.investment_events.map(item => item.id)).toEqual(['44444444-4444-4444-8444-444444444444'])

    expect(progress[0]).toBe('validating')
    expect(progress).toContain('collecting-current')
    expect(progress).toContain('deleting-collection:accounts')
    expect(progress).toContain('inserting-collection:accounts')
    expect(progress[progress.length - 1]).toBe('completed')
  })

  it('replaceDataWithBackup usa operacao atomica quando IPC estiver disponivel', async () => {
    const backup = makeValidBackup()
    const previousElectronApi = (window as any).electronAPI
    ;(window as any).electronAPI = { atomic: true }
    apiAtomicMock.mockResolvedValueOnce(undefined as any)

    await replaceDataWithBackup(backup.data as any)

    expect(apiAtomicMock).toHaveBeenCalledWith('replaceBackupData', {
      data: backup.data,
    })

    ;(window as any).electronAPI = previousElectronApi
  })

  it('summarizeBackup retorna contagem consistente por colecao', () => {
    const summary = summarizeBackup(makeValidBackup().data as any)
    expect(summary).toEqual({
      accounts: 1,
      transactions: 1,
      recurrents: 1,
      investmentPositions: 1,
      investmentEvents: 1,
    })
  })
})
