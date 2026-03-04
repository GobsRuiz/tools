<script setup lang="ts">
import dayjs from 'dayjs'
import { Bell, CalendarClock, ChevronRight, CircleAlert, Clock3, CreditCard, Repeat2 } from 'lucide-vue-next'
import type { AlertItem } from '~/composables/useAlerts'
import { useAlerts } from '~/composables/useAlerts'
import { formatCentsToBRL } from '~/utils/money'

const { groupedAlerts, counts, loadAlertSources } = useAlerts()
const loading = ref(true)

onMounted(async () => {
  try {
    await loadAlertSources()
  } finally {
    loading.value = false
  }
})

const sections = computed(() => [
  {
    key: 'overdue' as const,
    label: 'Atrasados',
    icon: CircleAlert,
    items: groupedAlerts.value.overdue,
    accentClass: 'text-red-500',
  },
  {
    key: 'today' as const,
    label: 'Hoje',
    icon: Clock3,
    items: groupedAlerts.value.today,
    accentClass: 'text-yellow-500',
  },
  {
    key: 'next' as const,
    label: 'Proximos 2 dias',
    icon: CalendarClock,
    items: groupedAlerts.value.next,
    accentClass: 'text-blue-500',
  },
])

function formatDate(isoDate: string): string {
  return dayjs(isoDate).format('DD/MM/YYYY')
}

function bucketLabel(item: AlertItem): string {
  if (item.daysUntil < 0) return 'Atrasado'
  if (item.daysUntil === 0) return 'Hoje'
  return `Em ${item.daysUntil} dia${item.daysUntil === 1 ? '' : 's'}`
}

function itemVisual(item: AlertItem) {
  if (item.alertType === 'invoice_due') {
    return {
      icon: CreditCard,
      iconClass: 'text-foreground border-border bg-muted/60',
    }
  }

  if (item.alertType === 'invoice_closing') {
    return {
      icon: CalendarClock,
      iconClass: 'text-foreground border-border bg-muted/60',
    }
  }

  return {
    icon: Repeat2,
    iconClass: 'text-foreground border-border bg-muted/60',
  }
}

function isIncome(item: AlertItem): boolean {
  return item.kind === 'income'
}

function formattedAmount(item: AlertItem): string {
  if (!item.amountCents) return ''
  return formatCentsToBRL(isIncome(item) ? item.amountCents : -item.amountCents)
}

function amountClass(item: AlertItem): string {
  return isIncome(item) ? 'text-emerald-400' : 'text-red-500'
}
</script>

<template>
  <Popover>
    <PopoverTrigger as-child>
      <Button variant="ghost" size="icon" class="relative">
        <Bell class="h-4 w-4" />
        <span
          v-if="counts.total > 0"
          class="absolute -right-1 -top-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-[10px] leading-[18px] text-white font-semibold text-center"
        >
          {{ counts.total > 99 ? '99+' : counts.total }}
        </span>
      </Button>
    </PopoverTrigger>

    <PopoverContent align="end" class="w-[380px] p-0">
      <div class="border-b px-3 py-2">
        <p class="text-sm font-semibold">Alertas</p>
        <p class="text-xs text-muted-foreground">
          {{ counts.total }} pendente{{ counts.total === 1 ? '' : 's' }}
        </p>
      </div>

      <div class="max-h-[360px] overflow-y-auto px-3 py-2 space-y-3">
        <template v-if="loading">
          <div class="space-y-2">
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
            <Skeleton class="h-9 w-full" />
          </div>
        </template>

        <p v-else-if="counts.total === 0" class="text-sm text-muted-foreground py-4 text-center">
          Nenhum alerta pendente.
        </p>

        <template v-else>
          <div
            v-for="section in sections"
            :key="section.key"
            v-show="section.items.length > 0"
            class="space-y-2"
          >
            <div class="flex items-center gap-2 text-xs font-medium" :class="section.accentClass">
              <component :is="section.icon" class="h-3.5 w-3.5" />
              {{ section.label }} ({{ section.items.length }})
            </div>

            <div class="space-y-1.5">
              <div
                v-for="item in section.items.slice(0, 6)"
                :key="item.id"
                class="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2"
              >
                <div class="flex items-start gap-2">
                  <div
                    class="mt-0.5 h-6 w-6 shrink-0 rounded-full border flex items-center justify-center"
                    :class="itemVisual(item).iconClass"
                  >
                    <component :is="itemVisual(item).icon" class="h-3 w-3" />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium truncate">{{ item.title }}</p>
                        <p class="text-[11px] text-muted-foreground truncate">{{ item.accountLabel }} - {{ item.subtitle }}</p>
                      </div>
                      <div class="text-right shrink-0">
                        <p class="text-[11px] font-medium">{{ bucketLabel(item) }}</p>
                        <p class="text-[10px] text-muted-foreground">{{ formatDate(item.targetDate) }}</p>
                      </div>
                    </div>

                    <p v-if="item.amountCents" class="mt-1 text-xs font-medium" :class="amountClass(item)">
                      {{ formattedAmount(item) }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="border-t px-2 py-2">
        <Button as-child variant="ghost" class="w-full justify-between">
          <NuxtLink to="/alertas">
            Visualizar mais
            <ChevronRight class="h-4 w-4" />
          </NuxtLink>
        </Button>
      </div>
    </PopoverContent>
  </Popover>
</template>
