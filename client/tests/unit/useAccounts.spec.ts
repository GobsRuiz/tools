import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { apiAtomicMock, apiDeleteMock, apiPatchMock, getMockDb, resetMockApi } from '../helpers/mockApi'

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

  it('adjustBalance serializa concorrencia por conta e evita perda de atualizacao', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Carteira', bank: 'Banco X', balance_cents: 10000 },
      ],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Carteira', bank: 'Banco X', balance_cents: 10000 } as any,
    ]

    const basePatch = apiPatchMock.getMockImplementation()
    if (!basePatch) {
      throw new Error('apiPatchMock sem implementacao padrao para o teste')
    }

    let firstPatchResolved = false
    apiPatchMock.mockImplementation(async (...args: Parameters<typeof basePatch>) => {
      if (!firstPatchResolved) {
        firstPatchResolved = true
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      return basePatch(...args)
    })

    await Promise.all([
      store.adjustBalance(1, -1000, 'Ajuste 1'),
      store.adjustBalance(1, -2000, 'Ajuste 2'),
    ])

    expect(store.accounts[0]?.balance_cents).toBe(7000)
    expect(getMockDb().accounts[0]?.balance_cents).toBe(7000)
    expect(apiPatchMock.mock.calls.map(([, body]) => (body as { balance_cents: number }).balance_cents)).toEqual([9000, 7000])
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

  it('deleteAccount deduplica chamadas concorrentes para a mesma conta', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 },
      ],
      transactions: [],
      recurrents: [],
      investment_positions: [],
      investment_events: [],
    })

    const store = useAccountsStore()
    store.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco A', balance_cents: 1000 } as any,
    ]

    const baseDelete = apiDeleteMock.getMockImplementation()
    let resolveDelete!: () => void
    const gate = new Promise<void>((resolve) => {
      resolveDelete = resolve
    })

    apiDeleteMock.mockImplementation(async (path: string) => {
      if (path === '/accounts/1') {
        await gate
      }
      return baseDelete?.(path) as any
    })

    const firstCall = store.deleteAccount(1)
    const secondCall = store.deleteAccount(1)

    resolveDelete()

    const [firstSummary, secondSummary] = await Promise.all([firstCall, secondCall])
    expect(firstSummary).toEqual(secondSummary)
    expect(getMockDb().accounts).toHaveLength(0)
    expect(apiDeleteMock.mock.calls.filter(([path]) => path === '/accounts/1')).toHaveLength(1)
  })
})
