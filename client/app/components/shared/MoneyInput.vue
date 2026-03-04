<script setup lang="ts">
import { cn } from '@/lib/utils'
import type { HTMLAttributes } from 'vue'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  disabled?: boolean
  class?: HTMLAttributes['class']
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const { displayValue, onInput: handleMaskInput } = useCurrencyMask()

// Sync externo → interno (quando modelValue muda de fora)
watch(() => props.modelValue, (val) => {
  if (val !== displayValue.value) {
    displayValue.value = val ?? ''
  }
}, { immediate: true })

function onInput(event: Event) {
  handleMaskInput(event)
  emit('update:modelValue', displayValue.value)
}
</script>

<template>
  <div class="relative">
    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">
      R$
    </span>
    <input
      :value="displayValue"
      inputmode="numeric"
      :placeholder="placeholder ?? '0,00'"
      :disabled="props.disabled"
      data-slot="input"
      :class="cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent pl-9 pr-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        props.class,
      )"
      @input="onInput"
    >
  </div>
</template>
