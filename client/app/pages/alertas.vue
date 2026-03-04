<script setup lang="ts">
import dayjs from 'dayjs'
import { BellRing, CalendarClock, CircleAlert, Clock3, CreditCard, Repeat2 } from 'lucide-vue-next'
import type { AlertBucket, AlertItem } from '~/composables/useAlerts'
import { useAlerts } from '~/composables/useAlerts'
import { usePageLoadState } from '~/composables/usePageLoadState'
import { formatCentsToBRL } from '~/utils/money'

type FilterKey = 'all' | AlertBucket

const { groupedAlerts, counts, loadAlertSources } = useAlerts()
const activeFilter = ref<FilterKey>('all')
const {
  loading,
  refreshing,
  runLoad,
  hasCurrentAttemptFatal,
  hasPartialLoadError,
  loadErrorMessage,
  staleDataMessage,
} = usePageLoadState()

const sourceLoaders = [
  { label: 'alertas', load: () => loadAlertSources() },
]

const hasFatalLoadError = computed(() => hasCurrentAttemptFatal.value)

async function loadPageData() {
  await runLoad(sourceLoaders)
}

onMounted(async () => {
  await loadPageData()
})

const filterOptions = computed(() => [
  { key: 'all' as const, label: 'Todos', count: counts.value.total, icon: BellRing },
  { key: 'overdue' as const, label: 'Atrasados', count: counts.value.overdue, icon: CircleAlert },
  { key: 'today' as const, label: 'Hoje', count: counts.value.today, icon: Clock3 },
  { key: 'next' as const, label: 'Proximos 2 dias', count: counts.value.next, icon: CalendarClock },
])

const sections = computed(() => {
  const source = groupedAlerts.value
  const all = [
    { key: 'overdue' as const, label: 'Atrasados', items: source.overdue, tone: 'text-red-500' },
    { key: 'today' as const, label: 'Hoje', items: source.today, tone: 'text-yellow-500' },
    { key: 'next' as const, label: 'Proximos 2 dias', items: source.next, tone: 'text-blue-500' },
  ]

  if (activeFilter.value === 'all') {
    return all.filter(section => section.items.length > 0)
  }

  return all.filter(section => section.key === activeFilter.value && section.items.length > 0)
})

const emptyMessage = computed(() => {
  if (activeFilter.value === 'all') return 'Nenhum alerta pendente.'
  if (activeFilter.value === 'overdue') return 'Nenhum alerta atrasado.'
  if (activeFilter.value === 'today') return 'Nenhum alerta para hoje.'
  return 'Nenhum alerta para os proximos 2 dias.'
})

function formatDate(isoDate: string): string {
  return dayjs(isoDate).format('DD/MM/YYYY')
}

function urgencyLabel(item: AlertItem): string {
  if (item.daysUntil < 0) {
    const abs = Math.abs(item.daysUntil)
    return `${abs} dia${abs === 1 ? '' : 's'} atrasado${abs === 1 ? '' : 's'}`
  }
  if (item.daysUntil === 0) return 'Vence hoje'
  return `Vence em ${item.daysUntil} dia${item.daysUntil === 1 ? '' : 's'}`
}

function itemVisual(item: AlertItem) {
  if (item.alertType === 'invoice_due') {
    return {
      icon: CreditCard,
      label: 'Fatura - Vencimento',
      chipClass: 'text-foreground border-border bg-muted/60',
      iconClass: 'text-foreground border-border bg-muted/60',
    }
  }

  if (item.alertType === 'invoice_closing') {
    return {
      icon: CalendarClock,
      label: 'Fatura - Fechamento',
      chipClass: 'text-foreground border-border bg-muted/60',
      iconClass: 'text-foreground border-border bg-muted/60',
    }
  }

  return {
    icon: Repeat2,
    label: 'Recorrente',
    chipClass: 'text-foreground border-border bg-muted/60',
    iconClass: 'text-foreground border-border bg-muted/60',
  }
}

function isIncome(item: AlertItem): boolean {
  return item.kind === 'income'
}

function amountClass(item: AlertItem): string {
  return isIncome(item) ? 'text-emerald-400' : 'text-red-500'
}

function formattedAmount(item: AlertItem): string {
  if (!item.amountCents) return ''
  return formatCentsToBRL(isIncome(item) ? item.amountCents : -item.amountCents)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <BellRing class="h-6 w-6 text-muted-foreground" />
      <h1 class="text-2xl font-bold">Alertas</h1>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-4">
        <div class="flex flex-wrap gap-2">
          <Button
            v-for="filter in filterOptions"
            :key="filter.key"
            size="sm"
            :variant="activeFilter === filter.key ? 'default' : 'outline'"
            class="gap-2"
            @click="activeFilter = filter.key"
          >
            <component :is="filter.icon" class="h-3.5 w-3.5" />
            {{ filter.label }}
            <Badge variant="secondary">{{ filter.count }}</Badge>
          </Button>
        </div>

        <template v-if="loading">
          <div class="space-y-3">
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </div>
        </template>

        <template v-else>
          <template v-if="hasFatalLoadError">
            <div class="space-y-3">
              <p class="font-semibold text-red-500">Não foi possível carregar alertas</p>
              <p class="text-sm text-muted-foreground">
                {{ loadErrorMessage || 'Verifique o servidor/API e tente novamente.' }}
              </p>
              <p v-if="staleDataMessage" class="text-xs text-yellow-500">
                {{ staleDataMessage }}
              </p>
              <Button :disabled="refreshing" @click="loadPageData">
                {{ refreshing ? 'Tentando novamente...' : 'Tentar novamente' }}
              </Button>
            </div>
          </template>

          <template v-else>
            <Card
              v-if="hasPartialLoadError"
              class="border-yellow-500/30 bg-yellow-500/5"
            >
              <CardContent class="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between">
                <p class="text-sm text-muted-foreground">
                  {{ loadErrorMessage }} Alguns dados podem estar incompletos.
                </p>
                <Button variant="outline" :disabled="refreshing" @click="loadPageData">
                  {{ refreshing ? 'Atualizando...' : 'Tentar novamente' }}
                </Button>
              </CardContent>
            </Card>

            <template v-if="sections.length === 0">
              <p class="text-center text-sm text-muted-foreground py-8">
                {{ emptyMessage }}
              </p>
            </template>

            <template v-else>
              <div
                v-for="section in sections"
                :key="section.key"
                class="space-y-3"
              >
                <div class="flex items-center gap-2">
                  <Badge variant="outline" :class="section.tone">{{ section.label }}</Badge>
                  <span class="text-xs text-muted-foreground">{{ section.items.length }} alerta{{ section.items.length === 1 ? '' : 's' }}</span>
                </div>

                <div class="space-y-2">
                  <Card
                    v-for="item in section.items"
                    :key="item.id"
                    class="gap-2 border-border/70 bg-gradient-to-br from-card to-card/70 hover:border-border transition-colors"
                  >
                    <CardContent class="px-4 py-3">
                      <div class="flex items-start gap-3">
                        <div
                          class="mt-0.5 h-9 w-9 shrink-0 rounded-full border flex items-center justify-center"
                          :class="itemVisual(item).iconClass"
                        >
                          <component :is="itemVisual(item).icon" class="h-4 w-4" />
                        </div>

                        <div class="min-w-0 flex-1">
                          <div class="flex items-start justify-between gap-4">
                            <div class="min-w-0">
                              <div class="flex items-center gap-2">
                                <p class="font-semibold truncate">{{ item.title }}</p>
                                <Badge variant="outline" class="text-[10px] px-1.5 py-0" :class="itemVisual(item).chipClass">
                                  {{ itemVisual(item).label }}
                                </Badge>
                              </div>

                              <p class="text-xs text-muted-foreground truncate mt-0.5">
                                {{ item.accountLabel }} - {{ item.subtitle }}
                              </p>
                            </div>

                            <div class="text-right shrink-0">
                              <p class="text-xs font-medium" :class="section.tone">{{ urgencyLabel(item) }}</p>
                              <p class="text-[11px] text-muted-foreground">{{ formatDate(item.targetDate) }}</p>
                            </div>
                          </div>

                          <p v-if="item.amountCents" class="mt-2 text-sm font-semibold" :class="amountClass(item)">
                            {{ formattedAmount(item) }}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </template>
          </template>
        </template>
      </CardContent>
    </Card>
  </div>
</template>
