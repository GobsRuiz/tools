import { describe, expect, it } from 'vitest'
import { buildVariation, percentOf, progressWidth, shareOf } from '~/utils/dashboard-math'

describe('utils/dashboard-math', () => {
  it('buildVariation retorna "Sem variacao" quando atual e anterior sao zero', () => {
    expect(buildVariation(0, 0)).toEqual({
      label: 'Sem variacao',
      tone: 'text-muted-foreground',
    })
  })

  it('buildVariation retorna "Novo no periodo" quando anterior e zero e atual positivo', () => {
    expect(buildVariation(1500, 0)).toEqual({
      label: 'Novo no periodo',
      tone: 'text-emerald-400',
    })
    expect(buildVariation(1500, 0, true)).toEqual({
      label: 'Novo no periodo',
      tone: 'text-red-500',
    })
  })

  it('buildVariation calcula percentual e tom corretamente com e sem inversao', () => {
    expect(buildVariation(120, 100)).toEqual({
      label: '+20.0% vs mes anterior',
      tone: 'text-emerald-400',
    })

    expect(buildVariation(80, 100)).toEqual({
      label: '-20.0% vs mes anterior',
      tone: 'text-red-500',
    })

    expect(buildVariation(80, 100, true)).toEqual({
      label: '-20.0% vs mes anterior',
      tone: 'text-emerald-400',
    })
  })

  it('percentOf retorna 0% quando total invalido', () => {
    expect(percentOf(50, 0)).toBe('0%')
    expect(percentOf(50, -10)).toBe('0%')
  })

  it('percentOf arredonda percentual', () => {
    expect(percentOf(1, 3)).toBe('33%')
    expect(percentOf(2, 3)).toBe('67%')
  })

  it('shareOf protege contra total ou valor nao positivo', () => {
    expect(shareOf(0, 100)).toBe(0)
    expect(shareOf(-50, 100)).toBe(0)
    expect(shareOf(50, 0)).toBe(0)
    expect(shareOf(25, 100)).toBe(25)
  })

  it('progressWidth aplica minimo visual de 7% para valores positivos pequenos', () => {
    expect(progressWidth(1, 1000)).toBe('7%')
    expect(progressWidth(69, 1000)).toBe('7%')
    expect(progressWidth(100, 1000)).toBe('10%')
    expect(progressWidth(0, 1000)).toBe('0%')
  })
})
