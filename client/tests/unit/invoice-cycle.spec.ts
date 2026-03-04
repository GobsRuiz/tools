import { describe, expect, it } from 'vitest'
import { computeCreditInvoiceCycleMonth, computeCreditInvoiceDueDate } from '~/utils/invoice-cycle'

describe('invoice-cycle utils', () => {
  describe('computeCreditInvoiceCycleMonth', () => {
    it('compra antes do fechamento fica no mesmo ciclo', () => {
      expect(computeCreditInvoiceCycleMonth('2026-03-07', 8)).toBe('2026-03')
    })

    it('compra no dia de fechamento vai para o mes seguinte', () => {
      expect(computeCreditInvoiceCycleMonth('2026-03-08', 8)).toBe('2026-04')
    })

    it('compra apos fechamento vai para o mes seguinte', () => {
      expect(computeCreditInvoiceCycleMonth('2026-03-09', 8)).toBe('2026-04')
    })

    it('fecha dia 1 em virada de mes', () => {
      expect(computeCreditInvoiceCycleMonth('2026-03-31', 1)).toBe('2026-04')
      expect(computeCreditInvoiceCycleMonth('2026-04-01', 1)).toBe('2026-05')
    })

    it('clamp de fechamento dia 31 em fevereiro', () => {
      expect(computeCreditInvoiceCycleMonth('2026-02-28', 31)).toBe('2026-03')
    })

    it('retorna null para data invalida', () => {
      expect(computeCreditInvoiceCycleMonth('2026/03/07', 8)).toBeNull()
      expect(computeCreditInvoiceCycleMonth('texto-invalido', 8)).toBeNull()
      expect(computeCreditInvoiceCycleMonth('2026-13-01', 8)).toBeNull()
    })
  })

  describe('computeCreditInvoiceDueDate', () => {
    it('dueDay maior que closingDay vence no mesmo mes do ciclo', () => {
      expect(computeCreditInvoiceDueDate('2026-03-07', 15, 8)).toBe('2026-03-15')
      expect(computeCreditInvoiceDueDate('2026-03-09', 15, 8)).toBe('2026-04-15')
    })

    it('dueDay menor ou igual ao closingDay vence no mes seguinte ao ciclo', () => {
      expect(computeCreditInvoiceDueDate('2026-03-07', 5, 8)).toBe('2026-04-05')
      expect(computeCreditInvoiceDueDate('2026-03-07', 8, 8)).toBe('2026-04-08')
    })

    it('sem closingDay usa mes seguinte por padrao', () => {
      expect(computeCreditInvoiceDueDate('2026-03-07', 10)).toBe('2026-04-10')
    })

    it('aplica clamp do dueDay no mes de vencimento', () => {
      expect(computeCreditInvoiceDueDate('2026-01-20', 31, 10)).toBe('2026-02-28')
      expect(computeCreditInvoiceDueDate('2024-01-20', 31, 10)).toBe('2024-02-29')
    })

    it('retorna null para purchaseDate invalida em due date', () => {
      expect(computeCreditInvoiceDueDate('2026/03/07', 10, 8)).toBeNull()
      expect(computeCreditInvoiceDueDate('texto-invalido', 10, 8)).toBeNull()
      expect(computeCreditInvoiceDueDate('2026-00-10', 10, 8)).toBeNull()
    })
  })
})
