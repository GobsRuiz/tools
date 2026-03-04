import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { apiAtomicMock, apiDeleteMock, getMockDb, resetMockApi } from '../helpers/mockApi'

describe('useAccountsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adjustBalance atualiza saldo da conta', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Carteira', bank: 'Banco X', balance_cents: 10000 },
      ],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Carteira', bank: 'Banco X', balance_cents: 10000 } as any,
    ]

    await store.adjustBalance(1, -2500, 'Compra mercado')

    expect(store.accounts[0]?.balance_cents).toBe(7500)
    expect(getMockDb().accounts[0]?.balance_cents).toBe(7500)
  })

  it('deleteAccount remove cascade e reporta progresso por etapa', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 },
        { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 },
      ],
      transactions: [
        { id: 'tx-1', accountId: 1, destinationAccountId: 2 },
        { id: 'tx-2', accountId: 2, destinationAccountId: 1 },
      ],
      recurrents: [
        { id: 'rec-1', accountId: 1 },
      ],
      investment_positions: [
        { id: 'pos-1', accountId: 1 },
      ],
      investment_events: [
        { id: 'evt-1', accountId: 1, positionId: 'pos-1' },
        { id: 'evt-2', accountId: 2, positionId: 'pos-1' },
      ],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 } as any,
    ]

    const progress: string[] = []
    const summary = await store.deleteAccount(1, (step) => progress.push(step))

    expect(summary).toMatchObject({
      transactionsDeleted: 2,
      recurrentsDeleted: 1,
      investmentPositionsDeleted: 1,
      investmentEventsDeleted: 2,
    })

    expect(progress).toEqual([
      'Excluindo eventos de investimento...',
      'Excluindo posicoes...',
      'Excluindo transacoes...',
      'Excluindo recorrentes...',
      'Removendo conta...',
      'Concluido!',
    ])

    const db = getMockDb()
    expect(db.accounts.map(a => a.id)).toEqual([2])
    expect(db.transactions).toEqual([])
    expect(db.recurrents).toEqual([])
    expect(db.investment_positions).toEqual([])
    expect(db.investment_events).toEqual([])
  })

  it('deleteAccount faz rollback completo quando falha no meio da cascata', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 },
        { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 },
      ],
      transactions: [
        { id: 'tx-1', accountId: 1, destinationAccountId: 2, type: 'transfer', amount_cents: -300, paid: true },
      ],
      recurrents: [
        { id: 'rec-1', accountId: 1 },
      ],
      investment_positions: [
        { id: 'pos-1', accountId: 1 },
      ],
      investment_events: [
        { id: 'evt-1', accountId: 1, positionId: 'pos-1' },
      ],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 } as any,
    ]

    const dbBefore = JSON.parse(JSON.stringify(getMockDb()))
    const baseDeleteImplementation = apiDeleteMock.getMockImplementation()

    apiDeleteMock.mockImplementationOnce(async (path: string) => baseDeleteImplementation?.(path) as any)
    apiDeleteMock.mockImplementationOnce(async () => { throw new Error('falha delete parcial') })

    await expect(store.deleteAccount(1)).rejects.toThrow('falha delete parcial')

    const dbAfter = getMockDb()
    expect(dbAfter).toEqual(dbBefore)
    expect(store.accounts.map(account => account.id)).toEqual([1, 2])
  })

  it('deleteAccount recompõe saldos de contas afetadas por transferências pagas', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta removida', bank: 'Banco A', balance_cents: 1000 },
        { id: 2, label: 'Conta remanescente', bank: 'Banco B', balance_cents: 4700 },
      ],
      transactions: [
        {
          id: 'tx-transfer-paid',
          accountId: 2,
          destinationAccountId: 1,
          type: 'transfer',
          amount_cents: -300,
          paid: true,
        },
      ],
      recurrents: [],
      investment_positions: [],
      investment_events: [],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta removida', bank: 'Banco A', balance_cents: 1000 } as any,
      { id: 2, label: 'Conta remanescente', bank: 'Banco B', balance_cents: 4700 } as any,
    ]

    const progress: string[] = []
    await store.deleteAccount(1, (step) => progress.push(step))

    expect(store.accounts.map(account => account.id)).toEqual([2])
    expect(store.accounts[0]?.balance_cents).toBe(5000)
    expect(progress).toContain('Recompondo saldos...')
  })

  it('deleteAccount usa operacao atomica quando IPC está disponível', async () => {
    resetMockApi({
      accounts: [
        { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 },
      ],
      transactions: [],
      recurrents: [],
      investment_positions: [],
      investment_events: [],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 } as any,
    ]

    const previousElectronApi = (window as any).electronAPI
    ;(window as any).electronAPI = { atomic: true }
    apiAtomicMock.mockResolvedValueOnce({
      transactionsDeleted: 3,
      recurrentsDeleted: 1,
      investmentPositionsDeleted: 1,
      investmentEventsDeleted: 2,
      auditTrail: [{ stage: 'backend_atomic' }],
    })

    const progress: string[] = []
    const summary = await store.deleteAccount(1, step => progress.push(step))

    expect(apiAtomicMock).toHaveBeenCalledWith('deleteAccountCascade', { accountId: 1 })
    expect(progress).toEqual(['Executando exclusao atomica...', 'Concluido!'])
    expect(summary.auditTrail?.some(entry => entry.stage === 'backend_atomic')).toBe(true)
    expect(summary.auditTrail?.some(entry => entry.stage === 'atomic_done')).toBe(true)
    expect(store.accounts.map(account => account.id)).toEqual([2])

    ;(window as any).electronAPI = previousElectronApi
  })

  it('deleteAccount em modo atomico retorna erro padronizado quando backend falha', async () => {
    resetMockApi({
      accounts: [{ id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 }],
    })

    const store = useAccountsStore()
    store.accounts = [{ id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any]

    const previousElectronApi = (window as any).electronAPI
    ;(window as any).electronAPI = { atomic: true }
    apiAtomicMock.mockRejectedValueOnce(new Error('falha backend'))

    await expect(store.deleteAccount(1)).rejects.toMatchObject({
      stage: 'delete_account_cascade',
      rollbackApplied: false,
      message: 'falha backend',
    })

    ;(window as any).electronAPI = previousElectronApi
  })

  it('deleteAccount sinaliza rollbackApplied=false quando restauracao do snapshot falha', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 },
        { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 },
      ],
      transactions: [
        { id: 'tx-1', accountId: 1, destinationAccountId: 2, type: 'transfer', amount_cents: -300, paid: true },
      ],
      recurrents: [],
      investment_positions: [],
      investment_events: [],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any,
      { id: 2, label: 'Conta B', bank: 'Banco B', balance_cents: 5000 } as any,
    ]

    apiDeleteMock
      .mockImplementationOnce(async () => { throw new Error('falha delete geral') })
      .mockImplementationOnce(async () => { throw new Error('falha delete geral') })

    await expect(store.deleteAccount(1)).rejects.toMatchObject({
      stage: 'delete_account_cascade',
      rollbackApplied: false,
      message: 'falha delete geral',
    })
  })
})
