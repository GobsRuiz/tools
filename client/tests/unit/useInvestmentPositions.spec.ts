import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { getMockDb, resetMockApi } from '../helpers/mockApi'

describe('useInvestmentPositionsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('updatePosition aplica patch no item correto', async () => {
    resetMockApi({
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          investment_type: 'fii',
          asset_code: 'HGLG11',
          is_active: true,
          invested_cents: 10000,
        },
      ],
    })

    const store = useInvestmentPositionsStore()
    store.positions = getMockDb().investment_positions as any

    const updated = await store.updatePosition('pos-1', {
      name: 'CSHG Logistica',
      invested_cents: 15000,
    })

    expect(updated.name).toBe('CSHG Logistica')
    expect(store.positions[0]?.invested_cents).toBe(15000)
    expect(getMockDb().investment_positions[0]?.invested_cents).toBe(15000)
  })

  it('deletePosition remove item do array e do mock db', async () => {
    resetMockApi({
      investment_positions: [
        {
          id: 'pos-1',
          accountId: 1,
          bucket: 'variable',
          investment_type: 'fii',
          asset_code: 'HGLG11',
          is_active: true,
          invested_cents: 10000,
        },
        {
          id: 'pos-2',
          accountId: 1,
          bucket: 'fixed',
          investment_type: 'cdb',
          asset_code: 'CDB-A',
          is_active: true,
          invested_cents: 20000,
        },
      ],
    })

    const store = useInvestmentPositionsStore()
    store.positions = getMockDb().investment_positions as any

    await store.deletePosition('pos-1')

    expect(store.positions.map(p => p.id)).toEqual(['pos-2'])
    expect(getMockDb().investment_positions.map(p => p.id)).toEqual(['pos-2'])
  })
})
