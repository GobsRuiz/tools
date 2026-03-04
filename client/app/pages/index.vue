<script setup lang="ts">
import dayjs from 'dayjs'
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js'
import {
  BellRing,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  TrendingDown,
  TrendingUp,
} from 'lucide-vue-next'
import { Bar, Doughnut, Line } from 'vue-chartjs'
import { useDashboardData } from '~/composables/useDashboardData'
import { usePageLoadState } from '~/composables/usePageLoadState'
import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'
import { monthKey } from '~/utils/dates'
import { percentOf, progressWidth } from '~/utils/dashboard-math'
import { formatCentsToBRL } from '~/utils/money'

ChartJS.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
)

const accountsStore = useAccountsStore()
const transactionsStore = useTransactionsStore()
const recurrentsStore = useRecurrentsStore()
const investmentPositionsStore = useInvestmentPositionsStore()
const investmentEventsStore = useInvestmentEventsStore()

const selectedMonth = ref(monthKey(dayjs().format('YYYY-MM-DD')))
const activeChartTab = ref<'flow' | 'type' | 'status'>('flow')
const investmentPeriodTab = ref<'month' | 'year' | 'all'>('month')

const {
  loading,
  refreshing,
  runLoad,
  hasCurrentAttemptFatal,
  hasPartialLoadError,
  loadErrorMessage,
  staleDataMessage,
} = usePageLoadState()

const {
  selectedMonthLabel, prevMonth, nextMonth,
  monthEntriesCents, monthExpensesCents,
  entriesVariation, expensesVariation,
  monthNetCents, monthNetVariation,
  balanceTotalCents, investedTotalCents,
  openInvoiceCount, openInvoiceTotalCents,
  unpaidDebitMonthCents, recurringPendingExpenseCents,
  pendingTotalCents, pendingCount,
  flowByWeek, hasFlowData, flowMaxCents, flowColumnsStyle, flowBarHeight, flowTooltip,
  expenseByMethod, expenseMixGradient,
  transactionTypeBreakdown, transactionTypeItems, spendingByType,
  expensePaymentStatus, expensePaymentItems,
  investmentSummary, investmentBucketItems,
  monthInvestmentEvents, investmentEventsForPeriod,
  investmentPeriodSummary, investmentPeriodItems, investmentPeriodDescription,
  flowChartData, flowChartHasData, flowChartOptions,
  typeChartData, typeChartHasData, typeChartOptions,
  statusChartData, statusChartHasData, statusChartOptions,
  investmentEvolutionPoints, investmentEvolutionChartData,
  investmentEvolutionChartHasData, investmentEvolutionChartOptions,
  investmentPositionLabel, investmentEventTypeLabel,
  investmentEventSignedCents, investmentEventAmountClass,
  counts, dashboardAlerts,
  alertBucketLabel, alertBucketClass,
  formatAlertAmount, alertAmountClass, alertIcon,
  shortDateLabel,
  latestTransactions, getAccountLabel,
  txDisplayLabel, txTypeLabel, txTypeIcon, txDateLabel,
} = useDashboardData(selectedMonth, investmentPeriodTab)

const sourceLoaders = [
  { label: 'contas', load: () => accountsStore.loadAccounts() },
  { label: 'movimentacoes', load: () => transactionsStore.loadTransactions() },
  { label: 'recorrentes', load: () => recurrentsStore.loadRecurrents() },
  { label: 'investimentos', load: () => investmentPositionsStore.loadPositions() },
  { label: 'lancamentos de investimentos', load: () => investmentEventsStore.loadEvents() },
]

const hasFatalLoadError = computed(() => hasCurrentAttemptFatal.value)

const showFirstUseEmptyState = computed(() =>
  !hasPartialLoadError.value
  && accountsStore.accounts.length === 0
  && transactionsStore.transactions.length === 0,
)

async function loadDashboardData() {
  await runLoad(sourceLoaders)
}

onMounted(async () => {
  await loadDashboardData()
})

</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div class="space-y-1">
        <div class="flex items-center gap-3">
          <LayoutDashboard class="h-6 w-6 text-muted-foreground" />
          <h1 class="text-2xl font-bold tracking-tight">Dashboard</h1>
        </div>
        <p class="text-sm text-muted-foreground">
          Visao consolidada de {{ selectedMonthLabel }}
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Mes anterior" @click="prevMonth">
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <Badge variant="secondary" class="px-3 py-1 text-sm font-medium">
          {{ selectedMonthLabel }}
        </Badge>
        <Button variant="outline" size="icon" aria-label="Proximo mes" @click="nextMonth">
          <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </div>

    <template v-if="loading">
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-36" />
            <Skeleton class="h-10 w-56" />
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
              <Skeleton class="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-28" />
            <Skeleton class="h-8 w-40" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-10 w-full" />
          </CardContent>
        </Card>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card v-for="item in 4" :key="item">
          <CardContent class="space-y-2 pt-6">
            <Skeleton class="h-4 w-24" />
            <Skeleton class="h-8 w-28" />
          </CardContent>
        </Card>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2">
          <CardContent class="space-y-2 pt-6">
            <Skeleton class="h-4 w-40" />
            <Skeleton class="h-56 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-2 pt-6">
            <Skeleton class="h-4 w-32" />
            <Skeleton class="h-44 w-44 rounded-full mx-auto" />
            <Skeleton class="h-6 w-full" />
          </CardContent>
        </Card>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2">
          <CardContent class="space-y-2 pt-6">
            <Skeleton class="h-4 w-40" />
            <Skeleton v-for="item in 7" :key="item" class="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardContent class="space-y-2 pt-6">
            <Skeleton class="h-4 w-32" />
            <Skeleton v-for="item in 4" :key="item" class="h-16 w-full" />
          </CardContent>
        </Card>
      </div>
    </template>

    <template v-else-if="hasFatalLoadError">
      <Card class="border-red-500/30 bg-red-500/5">
        <CardContent class="space-y-4 pt-6">
          <div class="space-y-1">
            <p class="font-semibold text-red-500">Nao foi possivel carregar o dashboard</p>
            <p class="text-sm text-muted-foreground">
              {{ loadErrorMessage || 'Verifique o servidor/API e tente novamente.' }}
            </p>
            <p v-if="staleDataMessage" class="text-xs text-yellow-500">
              {{ staleDataMessage }}
            </p>
          </div>
          <Button :disabled="refreshing" @click="loadDashboardData">
            {{ refreshing ? 'Tentando novamente...' : 'Tentar novamente' }}
          </Button>
        </CardContent>
      </Card>
    </template>

    <template v-else>
      <Card
        v-if="hasPartialLoadError"
        class="border-yellow-500/30 bg-yellow-500/5"
      >
        <CardContent class="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="font-semibold text-yellow-500">Dados parciais no dashboard</p>
            <p class="text-sm text-muted-foreground">
              {{ loadErrorMessage }} Os dados visiveis podem estar incompletos.
            </p>
          </div>
          <Button variant="outline" :disabled="refreshing" @click="loadDashboardData">
            {{ refreshing ? 'Atualizando...' : 'Tentar novamente' }}
          </Button>
        </CardContent>
      </Card>

      <template v-if="showFirstUseEmptyState">
        <Card class="border-primary/30 bg-gradient-to-br from-card via-card to-primary/5">
          <CardHeader class="space-y-2">
            <CardTitle class="text-xl">Primeiros passos no Financeiro</CardTitle>
            <CardDescription>
              Nenhuma conta ou movimentacao encontrada. Comece cadastrando sua primeira conta para liberar o dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col gap-2 sm:flex-row">
            <Button as-child>
              <NuxtLink to="/contas">Cadastrar primeira conta</NuxtLink>
            </Button>
            <Button as-child variant="outline">
              <NuxtLink to="/settings">Importar backup</NuxtLink>
            </Button>
          </CardContent>
        </Card>
      </template>

      <template v-else>
      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2 border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
          <CardHeader class="pb-2">
            <CardDescription>Saldo consolidado</CardDescription>
            <CardTitle class="text-3xl md:text-4xl" :class="balanceTotalCents >= 0 ? 'text-emerald-400' : 'text-red-500'">
              {{ formatCentsToBRL(balanceTotalCents) }}
            </CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div class="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <p class="text-xs text-muted-foreground">Entradas do mes</p>
                <p class="text-lg font-semibold text-emerald-400">{{ formatCentsToBRL(monthEntriesCents) }}</p>
                <p class="text-[11px]" :class="entriesVariation.tone">{{ entriesVariation.label }}</p>
              </div>

              <div class="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <p class="text-xs text-muted-foreground">Saidas do mes</p>
                <p class="text-lg font-semibold text-red-500">{{ formatCentsToBRL(monthExpensesCents) }}</p>
                <p class="text-[11px]" :class="expensesVariation.tone">{{ expensesVariation.label }}</p>
              </div>

              <div class="rounded-lg border border-border/70 bg-background/40 px-3 py-2">
                <p class="text-xs text-muted-foreground">Resultado do mes</p>
                <p class="text-lg font-semibold" :class="monthNetCents >= 0 ? 'text-emerald-400' : 'text-red-500'">
                  {{ formatCentsToBRL(monthNetCents) }}
                </p>
                <p class="text-[11px]" :class="monthNetVariation.tone">{{ monthNetVariation.label }}</p>
              </div>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button as-child size="sm">
                <NuxtLink to="/movimentacoes">Nova movimentacao</NuxtLink>
              </Button>
              <Button as-child variant="outline" size="sm">
                <NuxtLink to="/pagamentos">Ir para pagamentos</NuxtLink>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card class="border-yellow-500/20 bg-gradient-to-br from-card to-yellow-500/5 shadow-sm">
          <CardHeader class="pb-2">
            <CardDescription>Pendencias do mes</CardDescription>
            <CardTitle class="text-3xl text-yellow-500">{{ formatCentsToBRL(pendingTotalCents) }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <p class="text-xs text-muted-foreground">{{ pendingCount }} itens em aberto</p>

            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <CreditCard class="h-4 w-4" />
                  Faturas
                </div>
                <span class="font-medium text-red-500">{{ formatCentsToBRL(openInvoiceTotalCents) }}</span>
              </div>

              <div class="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <Clock class="h-4 w-4" />
                  Avulsas
                </div>
                <span class="font-medium text-red-500">{{ formatCentsToBRL(unpaidDebitMonthCents) }}</span>
              </div>

              <div class="flex items-center justify-between rounded-md border border-border/60 bg-background/40 px-3 py-2">
                <div class="flex items-center gap-2 text-muted-foreground">
                  <BellRing class="h-4 w-4" />
                  Recorrentes
                </div>
                <span class="font-medium text-red-500">{{ formatCentsToBRL(recurringPendingExpenseCents) }}</span>
              </div>
            </div>

            <Button as-child variant="outline" class="w-full">
              <NuxtLink to="/pagamentos">Abrir pagamentos</NuxtLink>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <NuxtLink to="/movimentacoes" class="group">
          <Card class="h-full border-border/70 bg-gradient-to-br from-card to-card/80 transition-colors group-hover:border-emerald-500/40">
            <CardContent class="space-y-1 pt-6">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingUp class="h-4 w-4" />
                Entradas
              </div>
              <p class="text-2xl font-bold text-emerald-400">{{ formatCentsToBRL(monthEntriesCents) }}</p>
              <p class="text-xs" :class="entriesVariation.tone">{{ entriesVariation.label }}</p>
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/movimentacoes" class="group">
          <Card class="h-full border-border/70 bg-gradient-to-br from-card to-card/80 transition-colors group-hover:border-red-500/40">
            <CardContent class="space-y-1 pt-6">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <TrendingDown class="h-4 w-4" />
                Saidas
              </div>
              <p class="text-2xl font-bold text-red-500">{{ formatCentsToBRL(monthExpensesCents) }}</p>
              <p class="text-xs" :class="expensesVariation.tone">{{ expensesVariation.label }}</p>
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/investimentos" class="group">
          <Card class="h-full border-border/70 bg-gradient-to-br from-card to-card/80 transition-colors group-hover:border-blue-500/40">
            <CardContent class="space-y-1 pt-6">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <PiggyBank class="h-4 w-4" />
                Investido
              </div>
              <p class="text-2xl font-bold text-blue-500">{{ formatCentsToBRL(investedTotalCents) }}</p>
              <p class="text-xs text-muted-foreground">Total aplicado nas posicoes</p>
            </CardContent>
          </Card>
        </NuxtLink>

        <NuxtLink to="/pagamentos" class="group">
          <Card class="h-full border-border/70 bg-gradient-to-br from-card to-card/80 transition-colors group-hover:border-yellow-500/40">
            <CardContent class="space-y-1 pt-6">
              <div class="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock class="h-4 w-4" />
                Pendencias
              </div>
              <p class="text-2xl font-bold text-yellow-500">{{ pendingCount }}</p>
              <p class="text-xs text-muted-foreground">Itens ainda nao pagos</p>
            </CardContent>
          </Card>
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2">
          <CardHeader>
            <CardTitle class="text-lg">Analises do mes</CardTitle>
            <CardDescription>Graficos de {{ selectedMonthLabel.toLowerCase() }} com leitura numerica</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs v-model="activeChartTab" class="space-y-4">
              <TabsList class="grid w-full grid-cols-3">
                <TabsTrigger value="flow">Fluxo</TabsTrigger>
                <TabsTrigger value="type">Tipos</TabsTrigger>
                <TabsTrigger value="status">Status</TabsTrigger>
              </TabsList>

              <TabsContent value="flow" class="space-y-3">
                <div class="rounded-lg border border-border/70 bg-muted/20 p-4">
                  <template v-if="flowChartHasData">
                    <div class="h-64">
                      <Bar :data="flowChartData" :options="flowChartOptions" />
                    </div>
                  </template>

                  <p v-else class="flex h-56 items-center justify-center text-sm text-muted-foreground">
                    Sem dados para montar o grafico de fluxo.
                  </p>
                </div>

                <div class="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                    Entrada total: <span class="font-semibold text-emerald-400">{{ formatCentsToBRL(monthEntriesCents) }}</span>
                  </div>
                  <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                    Saida total: <span class="font-semibold text-red-500">{{ formatCentsToBRL(monthExpensesCents) }}</span>
                  </div>
                  <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                    Resultado:
                    <span class="font-semibold" :class="monthNetCents >= 0 ? 'text-emerald-400' : 'text-red-500'">
                      {{ formatCentsToBRL(monthNetCents) }}
                    </span>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="type" class="space-y-3">
                <div v-if="typeChartHasData" class="grid grid-cols-1 gap-4 md:grid-cols-[260px_1fr] md:items-center">
                  <div class="mx-auto h-56 w-full max-w-[260px]">
                    <Doughnut :data="typeChartData" :options="typeChartOptions" />
                  </div>

                  <div class="space-y-2">
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <div class="mb-1 flex items-center justify-between">
                        <span class="text-muted-foreground">Debito</span>
                        <span class="font-medium">
                          {{ percentOf(spendingByType.debit, spendingByType.total) }} - {{ formatCentsToBRL(spendingByType.debit) }}
                        </span>
                      </div>
                    </div>
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <div class="mb-1 flex items-center justify-between">
                        <span class="text-muted-foreground">Credito</span>
                        <span class="font-medium">
                          {{ percentOf(spendingByType.credit, spendingByType.total) }} - {{ formatCentsToBRL(spendingByType.credit) }}
                        </span>
                      </div>
                    </div>
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-sm">
                      <div class="mb-1 flex items-center justify-between">
                        <span class="text-muted-foreground">Transferencia</span>
                        <span class="font-medium">
                          {{ percentOf(spendingByType.transfer, spendingByType.total) }} - {{ formatCentsToBRL(spendingByType.transfer) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <p v-else class="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Sem dados para analisar tipos de movimentacao.
                </p>
              </TabsContent>

              <TabsContent value="status" class="space-y-3">
                <div v-if="statusChartHasData" class="space-y-3">
                  <div class="h-64 rounded-md border border-border/60 bg-muted/20 p-3">
                    <Bar :data="statusChartData" :options="statusChartOptions" />
                  </div>

                  <div class="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      Pago:
                      <span class="font-semibold text-emerald-400">
                        {{ percentOf(expensePaymentStatus.paidCents, expensePaymentStatus.totalCents) }} - {{ formatCentsToBRL(expensePaymentStatus.paidCents) }}
                      </span>
                    </div>
                    <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                      Pendente:
                      <span class="font-semibold text-yellow-500">
                        {{ percentOf(expensePaymentStatus.pendingCents, expensePaymentStatus.totalCents) }} - {{ formatCentsToBRL(expensePaymentStatus.pendingCents) }}
                      </span>
                    </div>
                  </div>
                </div>

                <p v-else class="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  Sem despesas no mes para analisar status de pagamento.
                </p>
              </TabsContent>

            </Tabs>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle class="text-lg">Distribuicao das saidas</CardTitle>
            <CardDescription>Credito, debito e outras despesas no mes</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex justify-center">
              <div class="relative size-44 rounded-full" :style="{ background: expenseMixGradient }">
                <div class="absolute inset-[22%] rounded-full border border-border/70 bg-card" />
                <div class="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
                  <p class="text-[11px] text-muted-foreground">Total</p>
                  <p class="text-sm font-semibold">{{ formatCentsToBRL(expenseByMethod.total) }}</p>
                </div>
              </div>
            </div>

            <div class="space-y-2 text-sm">
              <div class="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full bg-red-500" />
                  Credito
                </div>
                <span class="font-medium">
                  {{ percentOf(expenseByMethod.credit, expenseByMethod.total) }} - {{ formatCentsToBRL(-expenseByMethod.credit) }}
                </span>
              </div>

              <div class="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  Debito
                </div>
                <span class="font-medium">
                  {{ percentOf(expenseByMethod.debit, expenseByMethod.total) }} - {{ formatCentsToBRL(-expenseByMethod.debit) }}
                </span>
              </div>

              <div class="flex items-center justify-between rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <div class="flex items-center gap-2">
                  <span class="h-2.5 w-2.5 rounded-full bg-slate-500" />
                  Outras
                </div>
                <span class="font-medium">
                  {{ percentOf(expenseByMethod.other, expenseByMethod.total) }} - {{ formatCentsToBRL(-expenseByMethod.other) }}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card class="border-blue-500/20 bg-gradient-to-br from-card via-card to-blue-500/5 shadow-sm">
        <CardHeader class="gap-3">
          <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle class="text-lg">Analise de investimentos</CardTitle>
              <CardDescription>
                Mes, ano e todo o tempo com lancamentos exibidos apenas para {{ selectedMonthLabel.toLowerCase() }}
              </CardDescription>
            </div>

            <Tabs v-model="investmentPeriodTab" class="w-full md:w-auto">
              <TabsList class="grid w-full grid-cols-3 md:w-[320px]">
                <TabsTrigger value="month">Mes</TabsTrigger>
                <TabsTrigger value="year">Ano</TabsTrigger>
                <TabsTrigger value="all">Todo tempo</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent class="space-y-4">
          <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div class="space-y-3 xl:col-span-2">
              <div class="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  Periodo:
                  <span class="font-semibold text-foreground">{{ investmentPeriodDescription }}</span>
                </div>
                <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  Entradas:
                  <span class="font-semibold text-blue-500">{{ formatCentsToBRL(investmentPeriodSummary.incomingCents) }}</span>
                </div>
                <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  Saidas:
                  <span class="font-semibold text-red-500">{{ formatCentsToBRL(-investmentPeriodSummary.outgoingCents) }}</span>
                </div>
                <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                  Resultado:
                  <span class="font-semibold" :class="investmentPeriodSummary.netCents >= 0 ? 'text-emerald-400' : 'text-red-500'">
                    {{ formatCentsToBRL(investmentPeriodSummary.netCents) }}
                  </span>
                </div>
              </div>

              <div class="rounded-lg border border-border/70 bg-muted/20 p-4">
                <div class="mb-3 flex items-center justify-between">
                  <p class="text-sm font-medium">Evolucao do valor investido</p>
                  <span class="text-xs text-muted-foreground">{{ investmentPeriodSummary.eventCount }} lancamento(s)</span>
                </div>

                <div v-if="investmentEvolutionPoints.length" class="space-y-3">
                  <div class="h-64 rounded-md border border-border/60 bg-background/40 p-3">
                    <Line :data="investmentEvolutionChartData" :options="investmentEvolutionChartOptions" />
                  </div>

                  <div class="grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <div class="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                      Aportes e compras:
                      <span class="font-semibold text-blue-500">{{ formatCentsToBRL(investmentPeriodSummary.incomingCents) }}</span>
                    </div>
                    <div class="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                      Rendimentos:
                      <span class="font-semibold text-emerald-400">{{ formatCentsToBRL(investmentPeriodSummary.incomeCents) }}</span>
                    </div>
                    <div class="rounded-md border border-border/60 bg-background/40 px-3 py-2">
                      Saidas e resgates:
                      <span class="font-semibold text-red-500">{{ formatCentsToBRL(investmentPeriodSummary.outgoingCents) }}</span>
                    </div>
                  </div>
                </div>

                <p v-else class="py-8 text-center text-sm text-muted-foreground">
                  Sem lancamentos de investimentos no periodo selecionado.
                </p>
              </div>
            </div>

            <div class="space-y-3">
              <div class="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p class="mb-3 text-sm font-medium">Composicao atual da carteira</p>
                <div v-if="investmentSummary.totalCurrentByBucket > 0" class="space-y-3">
                  <div
                    v-for="item in investmentBucketItems"
                    :key="item.key"
                    class="rounded-md border border-border/60 bg-background/40 px-3 py-3"
                  >
                    <div class="mb-2 flex items-center justify-between text-sm">
                      <span class="text-muted-foreground">{{ item.label }}</span>
                      <span class="font-medium">
                        {{ percentOf(item.value, investmentSummary.totalCurrentByBucket) }} - {{ formatCentsToBRL(item.value) }}
                      </span>
                    </div>
                    <div class="h-2 rounded-full bg-muted/60">
                      <div
                        class="h-2 rounded-full transition-all"
                        :class="item.color"
                        :style="{ width: progressWidth(item.value, investmentSummary.totalCurrentByBucket) }"
                      />
                    </div>
                  </div>
                </div>
                <p v-else class="py-8 text-center text-sm text-muted-foreground">
                  Carteira sem valores atuais para compor o grafico.
                </p>
              </div>

              <div class="rounded-lg border border-border/70 bg-muted/20 p-4">
                <p class="mb-3 text-sm font-medium">Top posicoes por valor atual</p>
                <div v-if="investmentSummary.topPositions.length" class="space-y-2">
                  <div
                    v-for="item in investmentSummary.topPositions"
                    :key="item.id"
                    class="rounded-md border border-border/60 bg-background/40 px-3 py-2"
                  >
                    <div class="flex items-center justify-between gap-3">
                      <p class="truncate text-sm font-medium">{{ item.label }}</p>
                      <p class="shrink-0 text-sm font-medium text-cyan-500">{{ formatCentsToBRL(item.currentCents) }}</p>
                    </div>
                    <p class="mt-1 text-xs" :class="item.pnlCents >= 0 ? 'text-emerald-400' : 'text-red-500'">
                      Resultado: {{ formatCentsToBRL(item.pnlCents) }}
                    </p>
                  </div>
                </div>
                <p v-else class="py-8 text-center text-sm text-muted-foreground">
                  Sem posicoes para exibir ranking.
                </p>
              </div>
            </div>
          </div>

          <div class="rounded-lg border border-border/70 bg-muted/20 p-4">
            <div class="mb-3 flex items-center justify-between">
              <p class="text-sm font-medium">Lancamentos de investimentos do mes</p>
              <span class="text-xs text-muted-foreground">{{ selectedMonthLabel }}</span>
            </div>

            <div v-if="monthInvestmentEvents.length" class="space-y-2">
              <div
                v-for="event in monthInvestmentEvents.slice(0, 10)"
                :key="event.id"
                class="rounded-md border border-border/60 bg-background/40 px-3 py-2"
              >
                <div class="flex items-center justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{{ investmentPositionLabel(event.positionId) }}</p>
                    <p class="mt-0.5 text-xs text-muted-foreground">
                      {{ shortDateLabel(event.date) }} - {{ investmentEventTypeLabel(event.event_type) }}
                    </p>
                  </div>
                  <span class="text-sm font-semibold" :class="investmentEventAmountClass(event)">
                    {{ formatCentsToBRL(investmentEventSignedCents(event)) }}
                  </span>
                </div>
              </div>
            </div>

            <p v-else class="py-8 text-center text-sm text-muted-foreground">
              Nenhum lancamento de investimento em {{ selectedMonthLabel.toLowerCase() }}.
            </p>
          </div>
        </CardContent>
      </Card>

      <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card class="xl:col-span-2">
          <CardHeader class="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle class="text-lg">Ultimas movimentacoes</CardTitle>
              <CardDescription>Lancamentos mais recentes de {{ selectedMonthLabel.toLowerCase() }}</CardDescription>
            </div>
            <Button as-child variant="ghost" size="sm">
              <NuxtLink to="/movimentacoes">Ver tudo</NuxtLink>
            </Button>
          </CardHeader>
          <CardContent>
            <Table v-if="latestTransactions.length">
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Movimentacao</TableHead>
                  <TableHead>Metodo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead class="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="tx in latestTransactions" :key="tx.id">
                  <TableCell>{{ txDateLabel(tx.date) }}</TableCell>
                  <TableCell>
                    <div class="flex items-center gap-2 min-w-0">
                      <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted/30">
                        <component :is="txTypeIcon(tx)" class="h-3.5 w-3.5" :class="tx.type === 'income' ? 'text-green-500' : tx.type === 'transfer' ? 'text-blue-500' : 'text-red-500'" />
                      </span>
                      <div class="min-w-0">
                        <p class="truncate font-medium">{{ txDisplayLabel(tx) }}</p>
                        <p class="truncate text-xs text-muted-foreground">{{ getAccountLabel(tx.accountId) }} - {{ txTypeLabel(tx) }}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge v-if="tx.payment_method === 'credit'" variant="secondary">Credito</Badge>
                    <Badge v-else-if="tx.payment_method === 'debit'" variant="secondary">Debito</Badge>
                    <span v-else class="text-xs text-muted-foreground">-</span>
                  </TableCell>
                  <TableCell>
                    <Badge v-if="tx.paid" variant="outline" class="border-green-500/30 text-green-500">Pago</Badge>
                    <Badge v-else variant="outline" class="border-yellow-500/30 text-yellow-500">Pendente</Badge>
                  </TableCell>
                  <TableCell class="text-right font-medium" :class="tx.amount_cents < 0 ? 'text-red-500' : 'text-emerald-400'">
                    {{ formatCentsToBRL(tx.amount_cents) }}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>

            <p v-else class="py-10 text-center text-muted-foreground">
              Nenhuma movimentacao encontrada para {{ selectedMonthLabel.toLowerCase() }}.
            </p>
          </CardContent>
        </Card>

        <Card class="h-max">
          <CardHeader>
            <CardTitle class="text-lg">Proximos alertas</CardTitle>
            <CardDescription>{{ counts.total }} alerta(s) no periodo</CardDescription>
          </CardHeader>
          <CardContent class="space-y-2">
            <template v-if="dashboardAlerts.length">
              <div
                v-for="alert in dashboardAlerts"
                :key="alert.id"
                class="rounded-md border border-border/70 bg-muted/20 px-3 py-2"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <component :is="alertIcon(alert)" class="h-4 w-4 text-muted-foreground" />
                      <p class="truncate text-sm font-medium">{{ alert.title }}</p>
                    </div>
                    <p class="mt-1 truncate text-xs text-muted-foreground">
                      {{ alert.accountLabel }} - {{ alert.subtitle }}
                    </p>
                  </div>

                  <Badge variant="outline" class="shrink-0 text-[10px]" :class="alertBucketClass(alert.bucket)">
                    {{ alertBucketLabel(alert.bucket) }}
                  </Badge>
                </div>

                <div class="mt-2 flex items-center justify-between text-xs">
                  <span class="text-muted-foreground">{{ shortDateLabel(alert.targetDate) }}</span>
                  <span v-if="alert.amountCents" :class="alertAmountClass(alert)">
                    {{ formatAlertAmount(alert) }}
                  </span>
                </div>
              </div>

              <Button as-child variant="ghost" class="w-full">
                <NuxtLink to="/alertas">Abrir central de alertas</NuxtLink>
              </Button>
            </template>

            <p v-else class="py-8 text-center text-sm text-muted-foreground">
              Nenhum alerta pendente para este periodo.
            </p>
          </CardContent>
        </Card>
      </div>
      </template>
    </template>
  </div>
</template>

