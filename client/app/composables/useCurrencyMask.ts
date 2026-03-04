/**
 * Composable para máscara de moeda BRL (R$ 1.234,56)
 * Trabalha internamente com string formatada e expõe valor em centavos.
 */
export function useCurrencyMask(initialCents = 0) {
  const displayValue = ref(initialCents ? formatFromCents(initialCents) : '')
  const cents = ref(initialCents)

  function formatFromCents(value: number): string {
    if (value === 0) return ''
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100)
  }

  function onInput(event: Event) {
    const input = event.target as HTMLInputElement
    // Remove tudo que não é dígito
    const digits = input.value.replace(/\D/g, '')

    if (!digits) {
      displayValue.value = ''
      cents.value = 0
      return
    }

    const numericCents = parseInt(digits, 10)
    cents.value = numericCents

    displayValue.value = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numericCents / 100)

    // Reposicionar cursor no final
    nextTick(() => {
      input.value = displayValue.value
      input.setSelectionRange(input.value.length, input.value.length)
    })
  }

  function reset() {
    displayValue.value = ''
    cents.value = 0
  }

  function setCents(value: number) {
    cents.value = value
    displayValue.value = formatFromCents(value)
  }

  return {
    displayValue,
    cents,
    onInput,
    reset,
    setCents,
  }
}
