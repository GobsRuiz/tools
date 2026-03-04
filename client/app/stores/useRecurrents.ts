import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuid } from 'uuid'
import type { Recurrent } from '~~/schemas/zod-schemas'
import { apiGet, apiPost, apiPatch, apiDelete } from '~/utils/api'
import { CREDIT_CARD_BLANK_MESSAGE, CREDIT_CARD_PAIR_MESSAGE, hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { useAccountsStore } from './useAccounts'

export const useRecurrentsStore = defineStore('recurrents', () => {
  const recurrents = ref<Recurrent[]>([])

  function ensureCreditAccountConfigured(accountId: number, paymentMethod?: 'debit' | 'credit') {
    if (paymentMethod !== 'credit') return

    const accountsStore = useAccountsStore()
    const account = accountsStore.accounts.find(item => item.id === accountId)
    if (!account || !hasCompleteCreditCardConfig(account)) {
      throw new Error(`${CREDIT_CARD_PAIR_MESSAGE} ${CREDIT_CARD_BLANK_MESSAGE}`)
    }
  }

  async function loadRecurrents() {
    recurrents.value = await apiGet<Recurrent[]>('/recurrents')
  }

  async function addRecurrent(data: Omit<Recurrent, 'id'>) {
    ensureCreditAccountConfigured(data.accountId, data.payment_method)
    const created = await apiPost<Recurrent>('/recurrents', {
      ...data,
      id: uuid(),
    })
    recurrents.value.push(created)
    return created
  }

  async function updateRecurrent(id: string, patch: Partial<Recurrent>) {
    const current = recurrents.value.find(item => item.id === id)
    const nextAccountId = patch.accountId ?? current?.accountId
    const nextPaymentMethod = patch.payment_method ?? current?.payment_method
    if (nextAccountId != null) {
      ensureCreditAccountConfigured(nextAccountId, nextPaymentMethod)
    }

    const updated = await apiPatch<Recurrent>(`/recurrents/${id}`, patch)
    const idx = recurrents.value.findIndex(r => r.id === id)
    if (idx !== -1) recurrents.value[idx] = updated
    return updated
  }

  async function deleteRecurrent(id: string) {
    await apiDelete(`/recurrents/${id}`)
    recurrents.value = recurrents.value.filter(r => r.id !== id)
  }

  return { recurrents, loadRecurrents, addRecurrent, updateRecurrent, deleteRecurrent }
})

