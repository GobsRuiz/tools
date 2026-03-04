import { nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { useCurrencyMask } from '~/composables/useCurrencyMask'

describe('useCurrencyMask', () => {
  it('inicializa com valor em centavos e formata display', () => {
    const mask = useCurrencyMask(123456)
    expect(mask.cents.value).toBe(123456)
    expect(mask.displayValue.value).toBe('1.234,56')
  })

  it('onInput converte digitos em centavos e move cursor para o final', async () => {
    const mask = useCurrencyMask()
    const setSelectionRange = vi.fn()
    const input = { value: 'R$ 12,34', setSelectionRange } as unknown as HTMLInputElement

    mask.onInput({ target: input } as unknown as Event)
    await nextTick()

    expect(mask.cents.value).toBe(1234)
    expect(mask.displayValue.value).toBe('12,34')
    expect(setSelectionRange).toHaveBeenCalled()
  })

  it('onInput limpa estado quando nao ha digitos', async () => {
    const mask = useCurrencyMask(500)
    const input = { value: 'abc', setSelectionRange: vi.fn() } as unknown as HTMLInputElement

    mask.onInput({ target: input } as unknown as Event)
    await nextTick()

    expect(mask.cents.value).toBe(0)
    expect(mask.displayValue.value).toBe('')
  })

  it('setCents e reset atualizam estado de forma deterministica', () => {
    const mask = useCurrencyMask()
    mask.setCents(9900)
    expect(mask.cents.value).toBe(9900)
    expect(mask.displayValue.value).toBe('99,00')

    mask.reset()
    expect(mask.cents.value).toBe(0)
    expect(mask.displayValue.value).toBe('')
  })
})
