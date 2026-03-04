import { defineStore } from 'pinia'
import { ref } from 'vue'
import { v4 as uuid } from 'uuid'
import type { InvestmentEvent } from '~~/schemas/zod-schemas'
import { createAtomicOperationError } from '~/utils/atomic-error'
import { apiAtomic, apiGet, apiPost, apiPatch, apiDelete } from '~/utils/api'
import { useInvestmentPositionsStore } from './useInvestmentPositions'
import { useAccountsStore } from './useAccounts'

export const useInvestmentEventsStore = defineStore('investment-events', () => {
  const events = ref<InvestmentEvent[]>([])

  function validateInvestmentEventAmount(amountCents: number) {
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new Error('Valor do evento deve ser maior que zero')
    }
  }

  function assertRemovedEventFields(data: Record<string, unknown>) {
    if ('fees_cents' in data) {
      throw new Error('Campo fees_cents foi removido dos eventos de investimento.')
    }
  }

  function canUseAtomicIpc() {
    return typeof window !== 'undefined' && !!window.electronAPI?.atomic
  }

  function getAccountDeltaForEvent(event: InvestmentEvent) {
    const { event_type, amount_cents } = event
    if (event_type === 'buy' || event_type === 'contribution') {
      return -amount_cents
    }
    if (event_type === 'sell' || event_type === 'withdrawal' || event_type === 'maturity') {
      return amount_cents
    }
    return 0
  }

  async function loadEvents() {
    events.value = await apiGet<InvestmentEvent[]>('/investment_events')
  }

  function listByPosition(positionId: string) {
    return events.value
      .filter(e => e.positionId === positionId)
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  async function addEvent(data: Omit<InvestmentEvent, 'id'>) {
    assertRemovedEventFields(data as Record<string, unknown>)
    validateInvestmentEventAmount(data.amount_cents)

    let created: InvestmentEvent | null = null
    try {
      created = await apiPost<InvestmentEvent>('/investment_events', {
        ...data,
        id: uuid(),
      })
      events.value.push(created)
      await recomputePosition(created.positionId)
      await adjustAccountForEvent(created)
      return created
    } catch (error: any) {
      let rollbackApplied = false
      if (created) {
        try {
          await apiDelete(`/investment_events/${created.id}`)
          events.value = events.value.filter(item => item.id !== created!.id)
          await recomputePosition(created.positionId)
          rollbackApplied = true
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: created ? 'adjust_account_for_event' : 'create_event',
        message: error?.message || 'Falha ao registrar evento de investimento.',
        rollbackApplied,
      })
    }
  }

  async function updateEvent(id: string, patch: Partial<InvestmentEvent>) {
    const original = events.value.find(e => e.id === id)
    const originalSnapshot = original ? { ...original } : null
    let updated: InvestmentEvent | null = null

    assertRemovedEventFields(patch as Record<string, unknown>)
    if (patch.amount_cents !== undefined) {
      validateInvestmentEventAmount(patch.amount_cents)
    }

    try {
      updated = await apiPatch<InvestmentEvent>(`/investment_events/${id}`, patch)
      const idx = events.value.findIndex(e => e.id === id)
      if (idx !== -1) events.value[idx] = updated

      const affected = new Set<string>()
      if (originalSnapshot) affected.add(originalSnapshot.positionId)
      affected.add(updated.positionId)
      for (const positionId of affected) {
        await recomputePosition(positionId)
      }

      if (originalSnapshot) await adjustAccountForEvent(originalSnapshot, true)
      await adjustAccountForEvent(updated)

      return updated
    } catch (error: any) {
      let rollbackApplied = false
      if (originalSnapshot) {
        try {
          await apiPatch(`/investment_events/${id}`, originalSnapshot)
          const idx = events.value.findIndex(event => event.id === id)
          if (idx !== -1) events.value[idx] = originalSnapshot
          const rollbackAffected = new Set<string>([
            originalSnapshot.positionId,
            updated?.positionId ?? originalSnapshot.positionId,
          ])
          for (const positionId of rollbackAffected) {
            await recomputePosition(positionId)
          }
          rollbackApplied = true
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: updated ? 'update_event_post_process' : 'patch_event',
        message: error?.message || 'Falha ao atualizar evento de investimento.',
        rollbackApplied,
      })
    }
  }

  async function deleteEvent(id: string) {
    const event = events.value.find(e => e.id === id)
    if (!event) {
      await apiDelete(`/investment_events/${id}`)
      return
    }

    const snapshot = { ...event }
    let deletedFromDb = false
    try {
      await apiDelete(`/investment_events/${id}`)
      deletedFromDb = true
      events.value = events.value.filter(e => e.id !== id)
      await recomputePosition(snapshot.positionId)
      await adjustAccountForEvent(snapshot, true)
    } catch (error: any) {
      let rollbackApplied = false
      if (deletedFromDb) {
        try {
          await apiPost('/investment_events', snapshot)
          events.value.push(snapshot)
          await recomputePosition(snapshot.positionId)
          rollbackApplied = true
        } catch {
          rollbackApplied = false
        }
      }

      throw createAtomicOperationError({
        stage: 'delete_event',
        message: error?.message || 'Falha ao excluir evento de investimento.',
        rollbackApplied,
      })
    }
  }

  async function deleteEventsByPosition(
    positionId: string,
    options?: {
      skipRecompute?: boolean
      onProgress?: (progress: { deleted: number, total: number }) => void
    },
  ) {
    const relatedEvents = events.value.filter(event => event.positionId === positionId)
    const total = relatedEvents.length
    if (!total) {
      if (!options?.skipRecompute) {
        await recomputePosition(positionId)
      }
      return { deleted: 0, total: 0 }
    }

    const accountDeltaMap = new Map<number, number>()

    for (const [index, event] of relatedEvents.entries()) {
      await apiDelete(`/investment_events/${event.id}`)
      const reverseDelta = -getAccountDeltaForEvent(event)
      if (reverseDelta !== 0) {
        accountDeltaMap.set(
          event.accountId,
          (accountDeltaMap.get(event.accountId) ?? 0) + reverseDelta,
        )
      }
      options?.onProgress?.({ deleted: index + 1, total })
    }

    events.value = events.value.filter(event => event.positionId !== positionId)

    if (accountDeltaMap.size > 0) {
      const accountsStore = useAccountsStore()
      for (const [accountId, delta] of accountDeltaMap.entries()) {
        await accountsStore.adjustBalance(
          accountId,
          delta,
          'Reversao por exclusao de ativo',
        )
      }
    }

    if (!options?.skipRecompute) {
      await recomputePosition(positionId)
    }

    return { deleted: total, total }
  }

  async function deletePositionCascade(
    positionId: string,
    options?: { onProgress?: (progress: { deleted: number, total: number }) => void },
  ) {
    if (canUseAtomicIpc()) {
      options?.onProgress?.({ deleted: 0, total: 1 })
      const result = await apiAtomic<{ positionDeleted: number, eventsDeleted: number }>(
        'deletePositionCascade',
        { positionId },
      )

      const positionsStore = useInvestmentPositionsStore()
      positionsStore.positions = positionsStore.positions.filter(position => position.id !== positionId)
      events.value = events.value.filter(event => event.positionId !== positionId)

      await useAccountsStore().loadAccounts()
      options?.onProgress?.({ deleted: 1, total: 1 })

      return {
        deleted: result.eventsDeleted,
        total: result.eventsDeleted,
      }
    }

    const deletedEvents = await deleteEventsByPosition(positionId, {
      skipRecompute: true,
      onProgress: options?.onProgress,
    })
    await useInvestmentPositionsStore().deletePosition(positionId)
    return deletedEvents
  }

  async function recomputePosition(positionId: string) {
    const positionsStore = useInvestmentPositionsStore()
    const position = positionsStore.positions.find(p => p.id === positionId)
    if (!position) return

    const positionEvents = listByPosition(positionId)

    if (position.bucket === 'variable') {
      let quantity = 0
      let totalCostCents = 0

      for (const event of positionEvents) {
        if (event.event_type === 'buy') {
          const qty = event.quantity ?? 0
          quantity += qty
          totalCostCents += event.amount_cents
          continue
        }

        if (event.event_type === 'sell') {
          const qty = event.quantity ?? 0
          if (qty > 0 && quantity > 0) {
            const avgCost = totalCostCents / quantity
            totalCostCents = Math.max(0, Math.round(totalCostCents - avgCost * qty))
          }
          quantity = Math.max(0, quantity - qty)
          continue
        }
      }

      const avgCostCents = quantity > 0 ? Math.round(totalCostCents / quantity) : 0

      await positionsStore.updatePosition(positionId, {
        quantity_total: quantity,
        avg_cost_cents: avgCostCents || undefined,
        invested_cents: Math.max(0, totalCostCents),
      })
      return
    }

    let principalCents = 0
    let totalCents = 0

    for (const event of positionEvents) {
      if (event.event_type === 'contribution') {
        principalCents += event.amount_cents
        totalCents += event.amount_cents
        continue
      }
      if (event.event_type === 'income') {
        totalCents += event.amount_cents
        continue
      }
      if (event.event_type === 'withdrawal' || event.event_type === 'maturity') {
        principalCents -= event.amount_cents
        totalCents -= event.amount_cents
        continue
      }
    }

    const normalizedPrincipal = Math.max(0, principalCents)
    const normalizedTotal = Math.max(0, totalCents)
    await positionsStore.updatePosition(positionId, {
      principal_cents: normalizedPrincipal,
      current_value_cents: normalizedTotal,
      invested_cents: normalizedTotal,
    })
  }

  async function recomputeAllPositions() {
    const positionsStore = useInvestmentPositionsStore()
    const positionIds = positionsStore.positions.map(position => position.id)

    if (!positionIds.length) {
      return { total: 0, succeeded: 0, failed: 0 }
    }

    const results = await Promise.allSettled(
      positionIds.map(positionId => recomputePosition(positionId)),
    )

    let failed = 0
    results.forEach((result, index) => {
      if (result.status !== 'rejected') return
      failed += 1
      console.error(`Erro ao recalcular posicao ${positionIds[index]}:`, result.reason)
    })

    return {
      total: positionIds.length,
      succeeded: positionIds.length - failed,
      failed,
    }
  }

  /**
   * Ajusta saldo da conta vinculada ao evento.
   * - buy/contribution: debita (saiu dinheiro da conta)
   * - sell/withdrawal/maturity: credita (dinheiro voltou para conta)
   * - income: nenhum ajuste (rendimento fica no ativo)
   * Se reverse=true, inverte o sinal (usado ao excluir evento).
   */
  async function adjustAccountForEvent(event: InvestmentEvent, reverse = false) {
    const { event_type, amount_cents, accountId } = event
    let delta = 0

    if (event_type === 'buy' || event_type === 'contribution') {
      delta = -amount_cents // debita da conta
    } else if (event_type === 'sell' || event_type === 'withdrawal' || event_type === 'maturity') {
      delta = amount_cents // credita na conta
    }

    if (delta === 0) return

    if (reverse) delta = -delta

    const accountsStore = useAccountsStore()
    const label = event_type === 'buy' ? 'Compra investimento'
      : event_type === 'sell' ? 'Venda investimento'
      : event_type === 'contribution' ? 'Aporte investimento'
      : event_type === 'withdrawal' ? 'Resgate investimento'
      : 'Vencimento investimento'

    await accountsStore.adjustBalance(accountId, delta, label)
  }

  return {
    events,
    loadEvents,
    addEvent,
    updateEvent,
    deleteEvent,
    deleteEventsByPosition,
    deletePositionCascade,
    listByPosition,
    recomputePosition,
    recomputeAllPositions,
  }
})
