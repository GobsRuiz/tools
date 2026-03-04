import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuid } from 'uuid'
import type { InvestmentPosition } from '~/schemas/zod-schemas'
import { apiGet, apiPost, apiPatch, apiDelete } from '~/utils/api'

export const useInvestmentPositionsStore = defineStore('investment-positions', () => {
  const positions = ref<InvestmentPosition[]>([])

  async function loadPositions() {
    positions.value = await apiGet<InvestmentPosition[]>('/investment_positions')
  }

  async function addPosition(data: Omit<InvestmentPosition, 'id'>) {
    const created = await apiPost<InvestmentPosition>('/investment_positions', {
      ...data,
      id: uuid(),
    })
    positions.value.push(created)
    return created
  }

  async function updatePosition(id: string, patch: Partial<InvestmentPosition>) {
    const updated = await apiPatch<InvestmentPosition>(`/investment_positions/${id}`, patch)
    const idx = positions.value.findIndex(p => p.id === id)
    if (idx !== -1) positions.value[idx] = updated
    return updated
  }

  async function deletePosition(id: string) {
    await apiDelete(`/investment_positions/${id}`)
    positions.value = positions.value.filter(p => p.id !== id)
  }

  return { positions, loadPositions, addPosition, updatePosition, deletePosition }
})
