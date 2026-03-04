<script setup lang="ts">
import { ArrowLeftRight, Plus } from 'lucide-vue-next'
import type { Transaction, Recurrent } from '~~/schemas/zod-schemas'
import { useAccountsStore } from '~/stores/useAccounts'
import { useTransactionsStore } from '~/stores/useTransactions'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { usePageLoadState } from '~/composables/usePageLoadState'

const accountsStore = useAccountsStore()
const transactionsStore = useTransactionsStore()
const recurrentsStore = useRecurrentsStore()
const investmentPositionsStore = useInvestmentPositionsStore()
const investmentEventsStore = useInvestmentEventsStore()
const route = useRoute()
const router = useRouter()

type MovimentacoesTab = 'transacoes' | 'recorrentes' | 'investimentos'
type MovimentacaoTipo = 'transacao' | 'recorrente' | 'investimento'

interface MovimentacoesListExpose {
  focusTransaction: (txId: string) => boolean | Promise<boolean>
  focusRecurrent: (recId: string) => boolean | Promise<boolean>
}

const dialogOpen = ref(false)
const selectedListTab = ref<MovimentacoesTab>('transacoes')
const defaultNewType = ref<MovimentacaoTipo>('transacao')
const movimentacoesListRef = ref<MovimentacoesListExpose | null>(null)
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
  { label: 'contas', load: () => accountsStore.loadAccounts() },
  { label: 'movimentacoes', load: () => transactionsStore.loadTransactions() },
  { label: 'recorrentes', load: () => recurrentsStore.loadRecurrents() },
  { label: 'investimentos', load: () => investmentPositionsStore.loadPositions() },
  { label: 'eventos de investimentos', load: () => investmentEventsStore.loadEvents() },
]

// Estado de edição
const editingTransaction = ref<Transaction | null>(null)
const editingRecurrent = ref<Recurrent | null>(null)

const dialogTitle = computed(() => {
  if (editingTransaction.value) return 'Editar Transação'
  if (editingRecurrent.value) return 'Editar Recorrente'
  return 'Nova Movimentação'
})

onMounted(async () => {
  await loadPageData()
})

function parseTabQuery(value: unknown): MovimentacoesTab | null {
  if (typeof value !== 'string') return null
  if (value === 'transacoes' || value === 'recorrentes' || value === 'investimentos') return value
  return null
}

function parseStringQuery(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0]
  return null
}

const routeSelectedTab = computed<MovimentacoesTab>(() =>
  parseTabQuery(route.query.tab) ?? 'transacoes',
)

const hasFatalLoadError = computed(() => hasCurrentAttemptFatal.value)

async function loadPageData() {
  await runLoad(sourceLoaders)
}

async function applyRouteFocusFromQuery() {
  if (loading.value) return
  if (!movimentacoesListRef.value) return

  const txId = parseStringQuery(route.query.txId)
  const recId = parseStringQuery(route.query.recId)
  if (!txId && !recId) return

  await nextTick()

  let focused = false
  if (txId) {
    focused = !!(await movimentacoesListRef.value.focusTransaction(txId))
  } else if (recId) {
    focused = !!(await movimentacoesListRef.value.focusRecurrent(recId))
  }
  if (!focused) return

  const nextQuery = { ...route.query }
  delete nextQuery.txId
  delete nextQuery.recId

  await router.replace({ query: nextQuery }).catch((error) => {
    console.error('Erro ao limpar query de busca global em movimentacoes:', error)
  })
}

function openNew() {
  editingTransaction.value = null
  editingRecurrent.value = null
  defaultNewType.value = selectedListTab.value === 'recorrentes'
    ? 'recorrente'
    : selectedListTab.value === 'investimentos'
      ? 'investimento'
      : 'transacao'
  dialogOpen.value = true
}

function onTabChange(tab: MovimentacoesTab) {
  selectedListTab.value = tab
}

function onEditTransaction(tx: Transaction) {
  editingTransaction.value = tx
  editingRecurrent.value = null
  dialogOpen.value = true
}

function onEditRecurrent(rec: Recurrent) {
  editingTransaction.value = null
  editingRecurrent.value = rec
  dialogOpen.value = true
}

function onSaved() {
  dialogOpen.value = false
}

watch(
  () => [route.query.tab, route.query.txId, route.query.recId, loading.value],
  () => {
    if (loading.value) return
    void applyRouteFocusFromQuery()
  },
  { immediate: true },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <ArrowLeftRight class="h-6 w-6 text-muted-foreground" />
        <h1 class="text-2xl font-bold">Movimentações</h1>
      </div>

      <Dialog v-model:open="dialogOpen">
        <DialogTrigger as-child>
          <Button @click="openNew">
            <Plus class="h-4 w-4 mr-2" />
            Nova Movimentação
          </Button>
        </DialogTrigger>
        <DialogContent class="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{{ dialogTitle }}</DialogTitle>
            <DialogDescription>Preencha os dados da movimentação</DialogDescription>
          </DialogHeader>
          <MovimentacaoForm
            :edit-transaction="editingTransaction"
            :edit-recurrent="editingRecurrent"
            :default-type="defaultNewType"
            @saved="onSaved"
          />
        </DialogContent>
      </Dialog>
    </div>

    <!-- Skeleton -->
    <template v-if="loading">
      <Card>
        <CardContent class="pt-6 space-y-4">
          <Skeleton class="h-9 w-full rounded-md" />
          <Separator />
           <div class="flex gap-2">
             <Skeleton class="h-9 w-full rounded-md" />
             <Skeleton class="h-9 w-full rounded-md" />
             <Skeleton class="h-9 w-full rounded-md" />
           </div>
          <div class="space-y-2 pt-2">
            <Skeleton v-for="i in 6" :key="i" class="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </template>

    <template v-else-if="hasFatalLoadError">
      <Card class="border-red-500/30 bg-red-500/5">
        <CardContent class="space-y-3 pt-6">
          <p class="font-semibold text-red-500">Nao foi possivel carregar movimentacoes</p>
          <p class="text-sm text-muted-foreground">
            {{ loadErrorMessage || 'Verifique o servidor/API e tente novamente.' }}
          </p>
          <p v-if="staleDataMessage" class="text-xs text-yellow-500">
            {{ staleDataMessage }}
          </p>
          <Button :disabled="refreshing" @click="loadPageData">
            {{ refreshing ? 'Tentando novamente...' : 'Tentar novamente' }}
          </Button>
        </CardContent>
      </Card>
    </template>

    <!-- Lista -->
    <template v-else>
      <Card
        v-if="hasPartialLoadError"
        class="border-yellow-500/30 bg-yellow-500/5"
      >
        <CardContent class="flex flex-col gap-3 pt-6 md:flex-row md:items-center md:justify-between">
          <p class="text-sm text-muted-foreground">
            {{ loadErrorMessage }} Alguns dados podem estar incompletos.
          </p>
          <Button variant="outline" :disabled="refreshing" @click="loadPageData">
            {{ refreshing ? 'Atualizando...' : 'Tentar novamente' }}
          </Button>
        </CardContent>
      </Card>

      <MovimentacoesList
        ref="movimentacoesListRef"
        :initial-tab="routeSelectedTab"
        @edit-transaction="onEditTransaction"
        @edit-recurrent="onEditRecurrent"
        @tab-change="onTabChange"
      />
    </template>
  </div>
</template>

