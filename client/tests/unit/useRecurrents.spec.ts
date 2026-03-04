import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useAccountsStore } from '~/stores/useAccounts'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { getMockDb, resetMockApi } from '../helpers/mockApi'

describe('useRecurrentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('addRecurrent, updateRecurrent e deleteRecurrent funcionam no ciclo completo', async () => {
    resetMockApi({ recurrents: [] })

    const store = useRecurrentsStore()

    const created = await store.addRecurrent({
      accountId: 1,
      kind: 'expense',
      payment_method: 'debit',
      notify: true,
      name: 'Internet',
      amount_cents: -12000,
      frequency: 'monthly',
      day_of_month: undefined,
      due_day: 10,
      description: 'Plano fibra',
      active: true,
    } as any)

    expect(store.recurrents).toHaveLength(1)
    expect(created.name).toBe('Internet')

    const updated = await store.updateRecurrent(created.id, {
      amount_cents: -15000,
      due_day: 12,
      active: false,
    })

    expect(updated.amount_cents).toBe(-15000)
    expect(store.recurrents[0]?.due_day).toBe(12)
    expect(store.recurrents[0]?.active).toBe(false)

    await store.deleteRecurrent(created.id)
    expect(store.recurrents).toHaveLength(0)
    expect(getMockDb().recurrents).toHaveLength(0)
  })

  it('bloqueia addRecurrent de credito quando conta nao tem configuracao completa de cartao', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta sem due day', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8 },
      ],
      recurrents: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta sem due day', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8 } as any,
    ]

    const store = useRecurrentsStore()

    await expect(store.addRecurrent({
      accountId: 1,
      kind: 'expense',
      payment_method: 'credit',
      notify: true,
      name: 'Streaming',
      amount_cents: -2500,
      frequency: 'monthly',
      due_day: 10,
      active: true,
    } as any)).rejects.toThrow(/dia de fechamento e o dia de vencimento juntos/i)
  })

  it('permite addRecurrent de credito quando conta tem fechamento e vencimento', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8, card_due_day: 15 },
      ],
      recurrents: [],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta Cartao', bank: 'Banco X', balance_cents: 10000, card_closing_day: 8, card_due_day: 15 } as any,
    ]

    const store = useRecurrentsStore()
    const created = await store.addRecurrent({
      accountId: 1,
      kind: 'expense',
      payment_method: 'credit',
      notify: true,
      name: 'Streaming',
      amount_cents: -2500,
      frequency: 'monthly',
      due_day: 10,
      active: true,
    } as any)

    expect(created.payment_method).toBe('credit')
    expect(store.recurrents).toHaveLength(1)
  })

  it('bloqueia updateRecurrent ao mudar para pagamento em credito sem cartao completo', async () => {
    resetMockApi({
      accounts: [
        { id: 1, label: 'Conta A', bank: 'Banco X', balance_cents: 10000 },
      ],
      recurrents: [
        {
          id: 'rec-1',
          accountId: 1,
          kind: 'expense',
          payment_method: 'debit',
          notify: true,
          name: 'Academia',
          amount_cents: -9000,
          frequency: 'monthly',
          due_day: 5,
          active: true,
        },
      ],
    })

    const accountsStore = useAccountsStore()
    accountsStore.accounts = [
      { id: 1, label: 'Conta A', bank: 'Banco X', balance_cents: 10000 } as any,
    ]

    const store = useRecurrentsStore()
    store.recurrents = getMockDb().recurrents as any

    await expect(store.updateRecurrent('rec-1', { payment_method: 'credit' })).rejects.toThrow(
      /dia de fechamento e o dia de vencimento juntos/i,
    )
  })
})
