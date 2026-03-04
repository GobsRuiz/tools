<script setup lang="ts">
import dayjs from 'dayjs'
import {
  Check,
  Filter,
  ChevronsUpDown,
  X,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Repeat,
  Receipt,
} from 'lucide-vue-next'
import type { Transaction, Recurrent } from '~/schemas/zod-schemas'
import { useTransactionsStore } from '~/stores/useTransactions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useAccountsStore } from '~/stores/useAccounts'
import { useAppToast } from '~/composables/useAppToast'
import { hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { formatCentsToBRL } from '~/utils/money'
import { isPendingDebitExpenseTransactionForMonth } from '~/utils/pending-transactions'

const props = defineProps<{ month: string }>()

type ViewMode = 'open' | 'paid' | 'all'
type FaturaGroup = {
  accountId: number
  accountLabel: string
  dueDay?: number
  totalCents: number
  paidCents: number
  openCents: number
  transactions: Transaction[]
}

const transactionsStore = useTransactionsStore()
const recurrentsStore = useRecurrentsStore()
const accountsStore = useAccountsStore()
const appToast = useAppToast()

const viewMode = ref<ViewMode>('open')
const filtersOpen = ref(false)
const filterConta = ref<number | null>(null)
const filterTipo = ref<'todos' | 'fatura' | 'transacao' | 'recorrente'>('todos')

const expandedFaturas = ref<Set<number>>(new Set())
const payingId = ref<string | null>(null)
const recentlyPaidIds = ref<Set<string>>(new Set())
const paidHighlightTimers = new Map<string, ReturnType<typeof setTimeout>>()
const isProcessing = computed(() => payingId.value !== null)
const payFaturaProgress = ref(0)
const payFaturaTotal = ref(0)
const showPayFaturaModal = ref(false)

const payFaturaPercent = computed(() => {
  if (!payFaturaTotal.value) return 0
  return Math.round((payFaturaProgress.value / payFaturaTotal.value) * 100)
})

const payFaturaCurrentStep = computed(() => {
  if (!payFaturaTotal.value) return 0
  if (payFaturaProgress.value >= payFaturaTotal.value) return payFaturaTotal.value
  return payFaturaProgress.value + 1
})

const payFaturaCurrentLabel = computed(() => {
  if (!payFaturaTotal.value) return ''
  return `Pagando compra ${payFaturaCurrentStep.value} de ${payFaturaTotal.value}...`
})

const payFaturaStepMeta = computed(() => {
  if (!payFaturaTotal.value) return ''
  return `Etapa ${payFaturaCurrentStep.value} de ${payFaturaTotal.value}`
})

const actionButtonBaseClass = 'w-[132px] justify-center gap-1.5'
const paidActionButtonClass = `${actionButtonBaseClass} text-green-500 border-green-500/30 hover:bg-transparent disabled:opacity-100 disabled:cursor-default`

const modeOptions: { label: string, value: ViewMode }[] = [
  { label: 'Pendentes', value: 'open' },
  { label: 'Pagos', value: 'paid' },
  { label: 'Todos', value: 'all' },
]

const tipoOptions = [
  { label: 'Todos', value: 'todos' },
  { label: 'Faturas', value: 'fatura' },
  { label: 'Transações', value: 'transacao' },
  { label: 'Recorrentes', value: 'recorrente' },
]

const recurringPending = computed(() => {
  return recurrentsStore.recurrents.filter((rec) => {
    if (!rec.active) return false
    return !transactionsStore.hasRecurrentTransaction(rec.id, props.month)
  })
})

const recurringPendingFiltered = computed(() => {
  if (viewMode.value === 'paid') return [] as Recurrent[]
  let items = recurringPending.value
  if (filterConta.value) items = items.filter(rec => rec.accountId === filterConta.value)
  return items
})

const debitTransactionsMonth = computed(() => {
  return transactionsStore.transactions.filter(tx =>
    isPendingDebitExpenseTransactionForMonth(tx, props.month),
  )
})

const saldoCents = computed(() => {
  let total = 0
  for (const tx of transactionsStore.transactions) {
    if (monthKey(tx.date) === props.month && tx.amount_cents > 0) total += tx.amount_cents
  }
  for (const rec of recurrentsStore.recurrents) {
    if (!rec.active || rec.amount_cents <= 0) continue
    if (transactionsStore.hasRecurrentTransaction(rec.id, props.month)) continue
    total += rec.amount_cents
  }
  return total
})

const invoiceStatus = computed<'all' | 'open' | 'paid'>(() => {
  if (viewMode.value === 'open') return 'open'
  if (viewMode.value === 'paid') return 'paid'
  return 'all'
})

const faturas = computed<FaturaGroup[]>(() => {
  const invoiceMap = transactionsStore.creditInvoicesByAccount(props.month, invoiceStatus.value)
  const groups: FaturaGroup[] = []
  for (const [accountId, txs] of invoiceMap) {
    if (filterConta.value && accountId !== filterConta.value) continue
    const account = accountsStore.accounts.find(a => a.id === accountId)
    if (!hasCompleteCreditCardConfig(account)) continue
    const transactions = [...txs].sort((a, b) => a.date.localeCompare(b.date))
    const paidCents = transactions.filter(tx => tx.paid).reduce((s, tx) => s + Math.abs(tx.amount_cents), 0)
    const openCents = transactions.filter(tx => !tx.paid).reduce((s, tx) => s + Math.abs(tx.amount_cents), 0)
    groups.push({
      accountId,
      accountLabel: account.label,
      dueDay: account.card_due_day,
      totalCents: paidCents + openCents,
      paidCents,
      openCents,
      transactions,
    })
  }
  return groups.sort((a, b) => a.accountLabel.localeCompare(b.accountLabel))
})

const faturasFiltered = computed(() => {
  return faturas.value
})

const transacoesDebito = computed(() => {
  let items = debitTransactionsMonth.value
  if (filterConta.value) items = items.filter(tx => tx.accountId === filterConta.value)
  if (viewMode.value === 'open') items = items.filter(tx => !tx.paid)
  if (viewMode.value === 'paid') items = items.filter(tx => tx.paid)
  return [...items].sort((a, b) => a.date.localeCompare(b.date))
})

const showFaturasSection = computed(() => filterTipo.value === 'todos' || filterTipo.value === 'fatura')
const showTransacoesSection = computed(() => filterTipo.value === 'todos' || filterTipo.value === 'transacao')
const showRecorrentesSection = computed(() => viewMode.value !== 'paid' && (filterTipo.value === 'todos' || filterTipo.value === 'recorrente'))

const totalOpenCents = computed(() => {
  let total = faturas.value.reduce((s, fatura) => s + fatura.openCents, 0)
  total += debitTransactionsMonth.value
    .filter(tx => !tx.paid)
    .reduce((s, tx) => s + Math.abs(tx.amount_cents), 0)
  total += recurringPending.value.filter(rec => rec.amount_cents < 0).reduce((s, rec) => s + Math.abs(rec.amount_cents), 0)
  return total
})

const totalPaidCents = computed(() => {
  let total = faturas.value.reduce((s, fatura) => s + fatura.paidCents, 0)
  total += debitTransactionsMonth.value
    .filter(tx => tx.paid)
    .reduce((s, tx) => s + Math.abs(tx.amount_cents), 0)
  return total
})

const summaryTitle = computed(() => {
  if (viewMode.value === 'open') return 'Total em Aberto'
  if (viewMode.value === 'paid') return 'Total Pago'
  return 'Total do Mes'
})

const summaryClass = computed(() => {
  if (viewMode.value === 'open') return 'text-yellow-500'
  if (viewMode.value === 'paid') return 'text-blue-500'
  return 'text-red-500'
})

const summaryCents = computed(() => {
  if (viewMode.value === 'open') return totalOpenCents.value
  if (viewMode.value === 'paid') return totalPaidCents.value
  return totalOpenCents.value + totalPaidCents.value
})

const summaryCount = computed(() => {
  let count = 0
  if (showFaturasSection.value) count += faturasFiltered.value.length
  if (showTransacoesSection.value) count += transacoesDebito.value.length
  if (showRecorrentesSection.value) count += recurringPendingFiltered.value.length
  return count
})

const hasActiveFilters = computed(() => filterConta.value !== null || filterTipo.value !== 'todos')

const hasAnyResult = computed(() => {
  return (
    (showFaturasSection.value && faturasFiltered.value.length > 0)
    || (showTransacoesSection.value && transacoesDebito.value.length > 0)
    || (showRecorrentesSection.value && recurringPendingFiltered.value.length > 0)
  )
})

const emptyMessage = computed(() => {
  if (viewMode.value === 'open') return 'Nenhum item pendente encontrado para este mes.'
  if (viewMode.value === 'paid') return 'Nenhum item pago encontrado para este mes.'
  return 'Nenhum item encontrado para este mes.'
})

function toggleFatura(accountId: number) {
  if (isProcessing.value) return
  const next = new Set(expandedFaturas.value)
  if (next.has(accountId)) next.delete(accountId)
  else next.add(accountId)
  expandedFaturas.value = next
}

function getAccountLabel(accountId: number) {
  return accountsStore.accounts.find(a => a.id === accountId)?.label ?? '-'
}

function getTxLabel(tx: Transaction): string {
  if (tx.installment) return `${tx.installment.product} (${tx.installment.index}/${tx.installment.total})`
  return tx.description || 'Transacao'
}

function formatDisplayDate(date: string) {
  return dayjs(date).isValid() ? dayjs(date).format('DD/MM/YYYY') : date
}

function getFaturaVisibleTransactions(fatura: FaturaGroup) {
  if (viewMode.value === 'open') return fatura.transactions.filter(tx => !tx.paid)
  if (viewMode.value === 'paid') return fatura.transactions.filter(tx => tx.paid)
  return fatura.transactions
}

function getFaturaActionLabel(fatura: FaturaGroup) {
  if (payingId.value === `fatura-${fatura.accountId}`) return 'Pagando...'
  if (fatura.openCents === 0) return 'Pago'
  if (viewMode.value === 'open') return 'Pagar Fatura'
  return 'Pagar Aberto'
}

function getRecurrentLabel(rec: Recurrent, loading: boolean) {
  if (rec.kind === 'income') return loading ? 'Recebendo...' : 'Receber'
  if ((rec.payment_method ?? 'debit') === 'credit') return loading ? 'Lançando...' : 'Lançar'
  return loading ? 'Pagando...' : 'Pagar'
}

function faturaVisualId(accountId: number): string {
  return `fatura-${accountId}`
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

function clearFilters() {
  if (isProcessing.value) return
  filterConta.value = null
  filterTipo.value = 'todos'
}

function openPayFaturaModal(total: number) {
  payFaturaTotal.value = total
  payFaturaProgress.value = 0
  showPayFaturaModal.value = true
}

function closePayFaturaModal() {
  showPayFaturaModal.value = false
  payFaturaProgress.value = 0
  payFaturaTotal.value = 0
}

onBeforeRouteLeave(() => {
  if (!showPayFaturaModal.value) return true

  appToast.warning({
    title: 'Operação em andamento',
    description: 'Aguarde a conclusão. A navegação e os cliques estão temporariamente bloqueados.',
  })
  return false
})

async function payFatura(fatura: FaturaGroup) {
  if (isProcessing.value) return
  const openTransactions = fatura.transactions.filter(tx => !tx.paid)
  if (!openTransactions.length) return

  openPayFaturaModal(openTransactions.length)
  payingId.value = `fatura-${fatura.accountId}`
  try {
    for (const [index, tx] of openTransactions.entries()) {
      await transactionsStore.markPaid(tx.id)
      payFaturaProgress.value = index + 1
      markRecentlyPaid(tx.id)
    }
    closePayFaturaModal()
    markRecentlyPaid(faturaVisualId(fatura.accountId))
    appToast.success({
      title: 'Fatura paga',
      description: `${openTransactions.length} compra(s) marcada(s) como paga(s).`,
    })
  } catch (e: any) {
    closePayFaturaModal()
    appToast.error({
      title: 'Erro ao pagar fatura',
      description: e?.message || 'Não foi possível concluir o pagamento da fatura.',
    })
  } finally {
    payingId.value = null
  }
}

async function payTransaction(tx: Transaction) {
  if (isProcessing.value) return
  payingId.value = tx.id
  try {
    await transactionsStore.markPaid(tx.id)
    markRecentlyPaid(tx.id)
    appToast.success({
      title: 'Pagamento confirmado',
      description: `${getTxLabel(tx)} marcado como pago.`,
    })
  } catch (e: any) {
    appToast.error({
      title: 'Erro ao pagar transacao',
      description: e?.message || 'Não foi possível concluir o pagamento.',
    })
  } finally {
    payingId.value = null
  }
}

async function payRecurrent(rec: Recurrent) {
  if (isProcessing.value) return
  payingId.value = rec.id
  try {
    const tx = await transactionsStore.payRecurrent(rec, props.month)
    markRecentlyPaid(rec.id)
    if (tx?.id) {
      markRecentlyPaid(tx.id)
    }
    appToast.success({
      title: rec.kind === 'income' ? 'Recebimento confirmado' : 'Pagamento confirmado',
      description: `${rec.name} lancado com sucesso.`,
    })
  } catch (e: any) {
    appToast.error({
      title: 'Erro ao lançar recorrente',
      description: e?.message || 'Não foi possível lançar a recorrente.',
    })
  } finally {
    payingId.value = null
  }
}
</script>

<template>
  <div class="relative">
    <div
      class="space-y-4 transition-opacity"
      :class="isProcessing ? 'pointer-events-none opacity-60' : ''"
    >
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">Saldo</p>
          <p class="text-2xl font-bold text-green-500">{{ formatCentsToBRL(saldoCents) }}</p>
          <p class="text-xs text-muted-foreground mt-1">total recebido / a receber no mes</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">{{ summaryTitle }}</p>
          <p class="text-2xl font-bold" :class="summaryClass">{{ formatCentsToBRL(summaryCents) }}</p>
          <p class="text-xs text-muted-foreground mt-1">resumo do modo selecionado</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent class="pt-6">
          <p class="text-sm text-muted-foreground">Itens no Modo</p>
          <p class="text-2xl font-bold">{{ summaryCount }}</p>
          <p class="text-xs text-muted-foreground mt-1">faturas, transações e recorrentes</p>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardContent class="pt-6 space-y-4">
        <div class="flex flex-wrap items-center gap-2">
          <Button
            v-for="opt in modeOptions"
            :key="opt.value"
            size="sm"
            :variant="viewMode === opt.value ? 'secondary' : 'outline'"
            :disabled="isProcessing"
            @click="viewMode = opt.value"
          >
            {{ opt.label }}
          </Button>
        </div>

        <Collapsible v-model:open="filtersOpen">
          <CollapsibleTrigger as-child>
            <Button variant="ghost" size="sm" class="flex items-center gap-2 w-full justify-between">
              <span class="flex items-center gap-2"><Filter class="h-4 w-4" />Filtros</span>
              <ChevronsUpDown class="h-4 w-4" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent class="pt-3">
            <div class="grid grid-cols-2 gap-3">
              <Select v-model="filterConta">
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="null">Todas</SelectItem>
                  <SelectItem v-for="acc in accountsStore.accounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
                </SelectContent>
              </Select>
              <Select v-model="filterTipo">
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in tipoOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button v-if="hasActiveFilters" variant="ghost" size="sm" class="gap-2 mt-2 ml-auto" @click="clearFilters">
              <X class="h-4 w-4" />Limpar filtros
            </Button>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        <div v-if="showFaturasSection && faturasFiltered.length" class="space-y-2">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground"><CreditCard class="h-4 w-4" />Faturas do Cartão</div>
          <Table class="table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead class="w-6"></TableHead>
                <TableHead class="w-[23%]">Fatura</TableHead>
                <TableHead class="w-[12%]">Venc.</TableHead>
                <TableHead class="w-[12%]">Itens</TableHead>
                <TableHead class="w-[14%] text-right">Total</TableHead>
                <TableHead class="w-[14%] text-right">Pago</TableHead>
                <TableHead class="w-[14%] text-right">Aberto</TableHead>
                <TableHead class="w-[160px] text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="fatura in faturasFiltered" :key="fatura.accountId">
                <TableRow
                  class="cursor-pointer transition-all duration-300"
                  :class="[
                    recentlyPaidIds.has(faturaVisualId(fatura.accountId)) ? 'bg-emerald-500/10' : '',
                    fatura.openCents === 0 ? 'opacity-75' : '',
                  ]"
                  @click="toggleFatura(fatura.accountId)"
                >
                  <TableCell>
                    <button type="button" class="text-muted-foreground" @click.stop="toggleFatura(fatura.accountId)">
                      <ChevronDown v-if="expandedFaturas.has(fatura.accountId)" class="h-4 w-4" />
                      <ChevronRight v-else class="h-4 w-4" />
                    </button>
                  </TableCell>
                  <TableCell class="font-medium truncate">Fatura {{ fatura.accountLabel }}</TableCell>
                  <TableCell>{{ fatura.dueDay ? `Dia ${fatura.dueDay}` : '-' }}</TableCell>
                  <TableCell><Badge variant="secondary" class="text-xs">{{ getFaturaVisibleTransactions(fatura).length }} compras</Badge></TableCell>
                  <TableCell class="text-right text-red-500">{{ formatCentsToBRL(fatura.totalCents) }}</TableCell>
                  <TableCell class="text-right text-blue-500">{{ formatCentsToBRL(fatura.paidCents) }}</TableCell>
                  <TableCell class="text-right text-yellow-500">{{ formatCentsToBRL(fatura.openCents) }}</TableCell>
                  <TableCell class="text-right">
                    <Button
                      v-if="fatura.openCents === 0"
                      size="sm"
                      variant="outline"
                      :class="paidActionButtonClass"
                      disabled
                    ><Check class="h-3.5 w-3.5 transition-all duration-300" :class="recentlyPaidIds.has(faturaVisualId(fatura.accountId)) ? 'scale-110 text-emerald-400' : ''" />Pago</Button>
                    <Button
                      v-else
                      size="sm"
                      variant="outline"
                      :class="actionButtonBaseClass"
                      :disabled="isProcessing"
                      @click.stop="payFatura(fatura)"
                    >
                      <Spinner v-if="payingId === `fatura-${fatura.accountId}`" class="h-3.5 w-3.5" />
                      <Check v-else class="h-3.5 w-3.5" />
                      {{ getFaturaActionLabel(fatura) }}
                    </Button>
                  </TableCell>
                </TableRow>
                <TableRow v-if="expandedFaturas.has(fatura.accountId)" :key="`${fatura.accountId}-expand`">
                  <TableCell colspan="8" class="p-0 pt-0 pb-2">
                    <div class="space-y-1 pl-4 border-l-2 border-border ml-2">
                      <div
                        v-for="tx in getFaturaVisibleTransactions(fatura)"
                        :key="tx.id"
                        class="flex items-center justify-between py-1.5 px-3 rounded text-sm transition-all duration-300"
                        :class="[
                          tx.paid ? 'bg-muted/50 opacity-70' : 'hover:bg-muted/30',
                          recentlyPaidIds.has(tx.id) ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40' : '',
                        ]"
                      >
                        <div class="flex items-center gap-3">
                          <span
                            class="transition-all duration-300"
                            :class="tx.paid ? 'line-through text-muted-foreground' : ''"
                          >
                            {{ getTxLabel(tx) }}
                          </span>
                          <span class="text-muted-foreground text-xs">{{ formatDisplayDate(tx.date) }}</span>
                          <Badge
                            v-if="viewMode === 'all' && tx.paid"
                            variant="outline"
                            class="text-green-500 border-green-500/30"
                          >
                            Pago
                          </Badge>
                        </div>
                        <span class="text-red-500">{{ formatCentsToBRL(Math.abs(tx.amount_cents)) }}</span>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
        </div>

        <template v-if="showTransacoesSection && transacoesDebito.length">
          <Separator v-if="showFaturasSection && faturasFiltered.length" />
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Receipt class="h-4 w-4" />Transações Avulsas</div>
            <Table class="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[34%]">Descrição</TableHead>
                  <TableHead class="w-[16%]">Conta</TableHead>
                  <TableHead class="w-[14%]">Data</TableHead>
                  <TableHead class="w-[14%] text-right">Valor</TableHead>
                  <TableHead class="w-[160px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="tx in transacoesDebito"
                  :key="tx.id"
                  class="transition-all duration-300"
                  :class="[
                    tx.paid ? 'opacity-60' : '',
                    recentlyPaidIds.has(tx.id) ? 'bg-emerald-500/10' : '',
                  ]"
                >
                  <TableCell class="font-medium truncate">
                    <div class="flex items-center gap-2">
                      <span
                        class="transition-all duration-300"
                        :class="tx.paid ? 'line-through text-muted-foreground' : ''"
                      >
                        {{ getTxLabel(tx) }}
                      </span>
                      <Badge
                        v-if="viewMode === 'all' && tx.paid"
                        variant="outline"
                        class="text-green-500 border-green-500/30"
                      >
                        Pago
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell>{{ getAccountLabel(tx.accountId) }}</TableCell>
                  <TableCell>{{ formatDisplayDate(tx.date) }}</TableCell>
                  <TableCell class="text-right text-red-500">{{ formatCentsToBRL(Math.abs(tx.amount_cents)) }}</TableCell>
                  <TableCell class="text-right">
                    <Button
                      v-if="tx.paid"
                      size="sm"
                      variant="outline"
                      :class="paidActionButtonClass"
                      disabled
                    ><Check class="h-3.5 w-3.5 transition-all duration-300" :class="recentlyPaidIds.has(tx.id) ? 'scale-110 text-emerald-400' : ''" />Pago</Button>
                    <Button v-else size="sm" variant="outline" :class="actionButtonBaseClass" :disabled="isProcessing" @click.stop="payTransaction(tx)">
                      <Spinner v-if="payingId === tx.id" class="h-3.5 w-3.5" />
                      <Check v-else class="h-3.5 w-3.5" />
                      {{ payingId === tx.id ? 'Pagando...' : 'Pagar' }}
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </template>

        <template v-if="showRecorrentesSection && recurringPendingFiltered.length">
          <Separator v-if="(showFaturasSection && faturasFiltered.length) || (showTransacoesSection && transacoesDebito.length)" />
          <div class="space-y-2">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground"><Repeat class="h-4 w-4" />Recorrentes a Lançar</div>
            <Table class="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead class="w-[34%]">Descrição</TableHead>
                  <TableHead class="w-[16%]">Conta</TableHead>
                  <TableHead class="w-[14%]">Dia</TableHead>
                  <TableHead class="w-[14%] text-right">Valor</TableHead>
                  <TableHead class="w-[160px] text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="rec in recurringPendingFiltered" :key="rec.id">
                  <TableCell class="font-medium truncate">{{ rec.name }}</TableCell>
                  <TableCell>{{ getAccountLabel(rec.accountId) }}</TableCell>
                  <TableCell>{{ (rec.due_day ?? rec.day_of_month) ? `Dia ${rec.due_day ?? rec.day_of_month}` : '-' }}</TableCell>
                  <TableCell class="text-right" :class="rec.amount_cents < 0 ? 'text-red-500' : 'text-green-500'">{{ formatCentsToBRL(Math.abs(rec.amount_cents)) }}</TableCell>
                  <TableCell class="text-right">
                    <Button size="sm" variant="outline" :class="actionButtonBaseClass" :disabled="isProcessing" @click.stop="payRecurrent(rec)">
                      <Spinner v-if="payingId === rec.id" class="h-3.5 w-3.5" />
                      <Check v-else class="h-3.5 w-3.5" />
                      {{ getRecurrentLabel(rec, payingId === rec.id) }}
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </template>

        <p v-if="!hasAnyResult" class="text-center text-muted-foreground py-8">{{ emptyMessage }}</p>
      </CardContent>
    </Card>
    </div>
    <div
      v-if="isProcessing && !showPayFaturaModal"
      class="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/45 backdrop-blur-[1px]"
    >
      <Spinner class="h-5 w-5" />
    </div>

    <div
      v-if="showPayFaturaModal"
      class="fixed inset-0 z-[200] bg-background/80 backdrop-blur-[1px] cursor-wait"
    >
      <div class="absolute inset-0" />
      <div class="absolute inset-x-0 top-20 px-4">
        <Card class="mx-auto max-w-2xl border-primary/30 shadow-lg">
          <CardContent class="pt-6 space-y-3">
            <div class="flex items-center gap-2">
              <Spinner class="h-4 w-4 text-primary" />
              <p class="font-medium">Operação em andamento</p>
            </div>
            <p class="text-sm text-muted-foreground">
              Aguarde a conclusão. A navegação e os cliques estão temporariamente bloqueados.
            </p>
            <Progress :model-value="payFaturaPercent" class="h-2" />
            <p class="text-sm font-medium">{{ payFaturaCurrentLabel }}</p>
            <p class="text-xs text-muted-foreground">{{ payFaturaStepMeta }}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
