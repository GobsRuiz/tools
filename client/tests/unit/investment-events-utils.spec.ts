import { describe, expect, it } from 'vitest'
import {
  formatCentsToPtBrInput,
  formatQuantityPtBr,
  getEffectiveAvailableQuantityForSell,
  getInvestmentEventTypeLabel,
  getInvestmentEventValueColorClass,
  isOutflowInvestmentEventType,
} from '~/utils/investment-events'

describe('utils/investment-events', () => {
  it('resolve label de tipo conhecido e fallback para tipo desconhecido', () => {
    expect(getInvestmentEventTypeLabel('buy')).toBe('Compra')
    expect(getInvestmentEventTypeLabel('withdrawal')).toBe('Resgate')
    expect(getInvestmentEventTypeLabel('income')).toBe('Rendimento')
    expect(getInvestmentEventTypeLabel('unknown' as any)).toBe('unknown')
  })

  it('classifica corretamente tipos de saida', () => {
    expect(isOutflowInvestmentEventType('sell')).toBe(true)
    expect(isOutflowInvestmentEventType('withdrawal')).toBe(true)
    expect(isOutflowInvestmentEventType('maturity')).toBe(true)
    expect(isOutflowInvestmentEventType('buy')).toBe(false)
    expect(isOutflowInvestmentEventType('income')).toBe(false)
  })

  it('retorna classe de cor coerente para cada tipo de evento', () => {
    expect(getInvestmentEventValueColorClass('income')).toBe('text-blue-500')
    expect(getInvestmentEventValueColorClass('sell')).toBe('text-red-500')
    expect(getInvestmentEventValueColorClass('withdrawal')).toBe('text-red-500')
    expect(getInvestmentEventValueColorClass('maturity')).toBe('text-red-500')
    expect(getInvestmentEventValueColorClass('buy')).toBe('text-green-500')
    expect(getInvestmentEventValueColorClass('contribution')).toBe('text-green-500')
  })

  it('formata centavos para campo pt-BR e vazio quando undefined', () => {
    expect(formatCentsToPtBrInput(undefined)).toBe('')
    expect(formatCentsToPtBrInput(123456)).toBe('1.234,56')
    expect(formatCentsToPtBrInput(-123456)).toBe('-1.234,56')
  })

  it('formata quantidade com precisao pt-BR', () => {
    expect(formatQuantityPtBr(10)).toBe('10')
    expect(formatQuantityPtBr(1.23456789)).toBe('1,23456789')
  })

  it('calcula quantidade disponivel para venda considerando edicao de evento sell', () => {
    const position = { id: 'p-1', quantity_total: 100 } as any
    const editingEvent = { id: 'e-1', positionId: 'p-1', event_type: 'sell', quantity: 40 } as any

    expect(getEffectiveAvailableQuantityForSell(position, editingEvent)).toBe(140)
  })

  it('calcula quantidade disponivel para venda considerando edicao de evento buy', () => {
    const position = { id: 'p-1', quantity_total: 100 } as any
    const editingEvent = { id: 'e-1', positionId: 'p-1', event_type: 'buy', quantity: 30 } as any

    expect(getEffectiveAvailableQuantityForSell(position, editingEvent)).toBe(70)
  })

  it('nao altera disponibilidade quando evento editado eh de outra posicao', () => {
    const position = { id: 'p-1', quantity_total: 100 } as any
    const editingEvent = { id: 'e-1', positionId: 'p-2', event_type: 'sell', quantity: 80 } as any

    expect(getEffectiveAvailableQuantityForSell(position, editingEvent)).toBe(100)
  })

  it('aplica piso em zero quando ajuste de edicao deixaria quantidade negativa', () => {
    const position = { id: 'p-1', quantity_total: 5 } as any
    const editingEvent = { id: 'e-1', positionId: 'p-1', event_type: 'buy', quantity: 20 } as any

    expect(getEffectiveAvailableQuantityForSell(position, editingEvent)).toBe(0)
  })
})
