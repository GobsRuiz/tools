<script setup lang="ts">
import dayjs from 'dayjs'
import { Check } from 'lucide-vue-next'
import type { Transaction } from '~/schemas/zod-schemas'
import { useAppToast } from '~/composables/useAppToast'
import { useTransactionsStore } from '~/stores/useTransactions'
import { formatCentsToBRL } from '~/utils/money'

const props = defineProps<{
  parentId: string
}>()

const transactionsStore = useTransactionsStore()
const appToast = useAppToast()
const recentlyPaidIds = ref<Set<string>>(new Set())
const paidHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>()
const processingId = ref<string | null>(null)
const isProcessing = computed(() => processingId.value !== null)

const parcelas = computed(() =>
  transactionsStore.transactions
    .filter(t => t.installment?.parentId === props.parentId)
    .sort((a, b) => (a.installment?.index ?? 0) - (b.installment?.index ?? 0))
)

function formatDisplayDate(date: string) {
  return dayjs(date).isValid()
    ? dayjs(date).format('DD/MM/YYYY')
    : date
}

function markRecentlyPaid(id: string) {
  const next = new Set(recentlyPaidIds.value)
  next.add(id)
  recentlyPaidIds.value = next

  const existingTimer = paidHighlightTimers.get(id)
  if (existingTimer) {
    clearTimeout(existingTimer)
  }

  const timer = setTimeout(() => {
    const after = new Set(recentlyPaidIds.value)
    after.delete(id)
    recentlyPaidIds.value = after
    paidHighlightTimers.delete(id)
  }, 1400)

  paidHighlightTimers.set(id, timer)
}

onBeforeUnmount(() => {
  for (const timer of paidHighlightTimers.values()) {
    clearTimeout(timer)
  }
  paidHighlightTimers.clear()
})

async function togglePaid(tx: Transaction, checked: boolean | 'indeterminate') {
  if (isProcessing.value) return
  if (checked === 'indeterminate') return

  processingId.value = tx.id
  try {
    if (checked) {
      await transactionsStore.markPaid(tx.id)
      markRecentlyPaid(tx.id)
      appToast.success({
        title: 'Parcela paga',
        description: `Parcela ${tx.installment?.index}/${tx.installment?.total} marcada como paga.`,
      })
      return
    }

    await transactionsStore.markUnpaid(tx.id)
  } catch (e: any) {
    appToast.error({
      title: 'Erro ao atualizar parcela',
      description: e?.message || 'Não foi possível atualizar o status da parcela.',
    })
  } finally {
    processingId.value = null
  }
}
</script>

<template>
  <div
    class="space-y-1 pl-4 border-l-2 border-border ml-2 transition-opacity"
    :class="isProcessing ? 'pointer-events-none opacity-70' : ''"
  >
    <div
      v-for="p in parcelas"
      :key="p.id"
      class="flex items-center justify-between py-1.5 px-3 rounded text-sm transition-all duration-300"
      :class="[
        p.paid ? 'bg-muted/50 opacity-75' : 'hover:bg-muted/30',
        recentlyPaidIds.has(p.id) ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : '',
      ]"
    >
      <div class="flex items-center gap-3">
        <Checkbox
          :model-value="p.paid"
          :disabled="isProcessing"
          @update:model-value="(val) => togglePaid(p, val)"
        />
        <span
          class="transition-all duration-300"
          :class="p.paid ? 'line-through text-muted-foreground' : ''"
        >
          Parcela {{ p.installment?.index }}/{{ p.installment?.total }}
        </span>
        <span class="text-muted-foreground text-xs">{{ formatDisplayDate(p.date) }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span :class="p.amount_cents < 0 ? 'text-red-500' : 'text-green-500'">
          {{ formatCentsToBRL(p.amount_cents) }}
        </span>
        <Spinner v-if="processingId === p.id" class="h-3.5 w-3.5 text-muted-foreground" />
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="opacity-0 scale-75"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition-all duration-200 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-75"
        >
          <Check v-if="processingId !== p.id && p.paid" class="h-3.5 w-3.5 text-green-500" />
        </Transition>
      </div>
    </div>
  </div>
</template>
