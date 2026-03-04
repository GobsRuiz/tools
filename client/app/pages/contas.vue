<script setup lang="ts">
import { Landmark, Plus, Pencil, Trash2 } from 'lucide-vue-next'
import type { Account } from '~~/schemas/zod-schemas'
import { useAppToast } from '~/composables/useAppToast'
import { usePageLoadState } from '~/composables/usePageLoadState'
import { useAccountsStore } from '~/stores/useAccounts'
import { useRecurrentsStore } from '~/stores/useRecurrents'
import { useTransactionsStore } from '~/stores/useTransactions'
import { hasCompleteCreditCardConfig } from '~/utils/account-credit'
import { monthKey, nowISO } from '~/utils/dates'
import { formatCentsToBRL } from '~/utils/money'
import { getBankIdentity } from '~/utils/bankIdentity'
import { getErrorMessage } from '~/utils/error'

const accountsStore = useAccountsStore()
const transactionsStore = useTransactionsStore()
const recurrentsStore = useRecurrentsStore()
const appToast = useAppToast()

const dialogOpen = ref(false)
const editingAccount = ref<Account | null>(null)
const deleteConfirmOpen = ref(false)
const deleting = ref(false)
const deleteTarget = ref<Account | null>(null)
const accountFormProcessing = ref(false)
const isProcessing = computed(() => deleting.value || accountFormProcessing.value)
const showDeleteAccountModal = ref(false)
const {
  loading,
  refreshing,
  runLoad,
  hasCurrentAttemptFatal,
  hasPartialLoadError,
  loadErrorMessage,
  staleDataMessage,
} = usePageLoadState()

const DELETE_ACCOUNT_PROGRESS_STEPS = [
  'Excluindo eventos de investimento...',
  'Excluindo posicoes...',
  'Excluindo transacoes...',
  'Excluindo recorrentes...',
  'Removendo conta...',
  'Concluido!',
]

const deleteAccountProgressStep = ref(0)
const deleteAccountProgressLabel = ref(DELETE_ACCOUNT_PROGRESS_STEPS[0] ?? '')

const deleteAccountProgressPercent = computed(() => {
  const total = DELETE_ACCOUNT_PROGRESS_STEPS.length
  if (!total) return 0
  const current = Math.min(deleteAccountProgressStep.value + 1, total)
  return Math.round((current / total) * 100)
})

const deleteAccountProgressMeta = computed(() => {
  const total = DELETE_ACCOUNT_PROGRESS_STEPS.length
  if (!total) return ''
  const current = Math.min(deleteAccountProgressStep.value + 1, total)
  return `Etapa ${current} de ${total}`
})

const sourceLoaders = [
  { label: 'contas', load: () => accountsStore.loadAccounts() },
  { label: 'movimentacoes', load: () => transactionsStore.loadTransactions() },
  { label: 'recorrentes', load: () => recurrentsStore.loadRecurrents() },
]

onMounted(async () => {
  await loadPageData()
})

const hasFatalLoadError = computed(() => hasCurrentAttemptFatal.value)

async function loadPageData() {
  await runLoad(sourceLoaders)
}

const invoiceReferenceMonth = computed(() => monthKey(nowISO()))

const creditInvoiceByAccount = computed(() => {
  const grouped = new Map<number, number>()
  const byAccount = transactionsStore.creditInvoicesByAccount(invoiceReferenceMonth.value, 'open')

  for (const [accountId, transactions] of byAccount) {
    const total = transactions.reduce((sum, tx) => sum + tx.amount_cents, 0)
    grouped.set(accountId, total)
  }

  return grouped
})

function getCreditInvoiceCents(accountId: number) {
  return creditInvoiceByAccount.value.get(accountId) ?? 0
}

function openNew() {
  if (isProcessing.value) return
  editingAccount.value = null
  dialogOpen.value = true
}

function openEdit(acc: Account) {
  if (isProcessing.value) return
  editingAccount.value = acc
  dialogOpen.value = true
}

function onSaved() {
  dialogOpen.value = false
  editingAccount.value = null
  accountFormProcessing.value = false
}

function onDialogOpenChange(open: boolean) {
  if (!open && accountFormProcessing.value) return
  dialogOpen.value = open
  if (!open) {
    editingAccount.value = null
  }
}

function onAccountFormProcessing(value: boolean) {
  accountFormProcessing.value = value
}

function getLinkedTransactionsCount(accountId: number) {
  return transactionsStore.transactions.filter(tx =>
    tx.accountId === accountId || tx.destinationAccountId === accountId,
  ).length
}

function getLinkedRecurrentsCount(accountId: number) {
  return recurrentsStore.recurrents.filter(rec => rec.accountId === accountId).length
}

const deleteTxCount = computed(() =>
  deleteTarget.value ? getLinkedTransactionsCount(deleteTarget.value.id) : 0,
)

const deleteRecCount = computed(() =>
  deleteTarget.value ? getLinkedRecurrentsCount(deleteTarget.value.id) : 0,
)

const deleteDescription = computed(() => {
  if (!deleteTarget.value) return 'Esta ação é irreversível.'

  const warnings: string[] = []
  if (deleteTxCount.value > 0) {
    warnings.push(`Esta conta possui ${deleteTxCount.value} transação(ões) vinculada(s).`)
  }
  if (deleteRecCount.value > 0) {
    warnings.push(`Tambem possui ${deleteRecCount.value} recorrente(s) vinculada(s).`)
  }

  if (!warnings.length) {
    return 'Deseja excluir esta conta? Esta ação é irreversível.'
  }

  return `${warnings.join(' ')} Deseja excluir tudo? Esta ação é irreversível.`
})

function requestDelete(acc: Account) {
  if (isProcessing.value) return
  deleteTarget.value = acc
  deleteConfirmOpen.value = true
}

function cancelDeleteAccount() {
  if (isProcessing.value) return
  deleteConfirmOpen.value = false
  deleteTarget.value = null
}

function startDeleteAccountProgress() {
  deleteAccountProgressStep.value = 0
  deleteAccountProgressLabel.value = DELETE_ACCOUNT_PROGRESS_STEPS[0] ?? ''
  showDeleteAccountModal.value = true
}

function updateDeleteAccountProgress(step: string) {
  const stepIndex = DELETE_ACCOUNT_PROGRESS_STEPS.indexOf(step)
  if (stepIndex >= 0) {
    deleteAccountProgressStep.value = stepIndex
  }
  deleteAccountProgressLabel.value = step
}

function resetDeleteAccountProgress() {
  showDeleteAccountModal.value = false
  deleteAccountProgressStep.value = 0
  deleteAccountProgressLabel.value = DELETE_ACCOUNT_PROGRESS_STEPS[0] ?? ''
}

onBeforeRouteLeave(() => {
  if (!showDeleteAccountModal.value) return true

  appToast.warning({
    title: 'Operação em andamento',
    description: 'Aguarde a conclusão. A navegação e os cliques estão temporariamente bloqueados.',
  })
  return false
})

async function confirmDeleteAccount() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true

  const accountId = deleteTarget.value.id

  try {
    deleteConfirmOpen.value = false
    startDeleteAccountProgress()

    const deleted = await accountsStore.deleteAccount(accountId, updateDeleteAccountProgress)
    transactionsStore.transactions = transactionsStore.transactions.filter(tx =>
      tx.accountId !== accountId && tx.destinationAccountId !== accountId,
    )
    recurrentsStore.recurrents = recurrentsStore.recurrents.filter(rec => rec.accountId !== accountId)

    appToast.success({
      title: 'Conta excluida',
      description: `${deleted.transactionsDeleted} transação(ões), ${deleted.recurrentsDeleted} recorrente(s), ${deleted.investmentPositionsDeleted} posição(ões) e ${deleted.investmentEventsDeleted} evento(s) removidos.`,
    })
  } catch (e: unknown) {
    appToast.error({
      title: 'Erro ao excluir conta',
      description: getErrorMessage(e, 'Não foi possível excluir a conta.'),
    })
  } finally {
    resetDeleteAccountProgress()
    deleting.value = false
    deleteConfirmOpen.value = false
    deleteTarget.value = null
  }
}
</script>

<template>
  <div class="relative space-y-6">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <Landmark class="h-6 w-6 text-muted-foreground" />
        <h1 class="text-2xl font-bold">Contas</h1>
      </div>

      <Dialog :open="dialogOpen" @update:open="onDialogOpenChange">
        <DialogTrigger as-child>
          <Button :disabled="isProcessing" @click="openNew">
            <Plus class="h-4 w-4 mr-2" />
            Nova Conta
          </Button>
        </DialogTrigger>
        <DialogContent class="max-w-lg" :show-close-button="!accountFormProcessing">
          <DialogHeader>
            <DialogTitle>{{ editingAccount ? 'Editar Conta' : 'Nova Conta' }}</DialogTitle>
            <DialogDescription>Preencha os dados da conta bancária</DialogDescription>
          </DialogHeader>
          <AccountFormModal
            :account="editingAccount"
            @saved="onSaved"
            @processing="onAccountFormProcessing"
          />
        </DialogContent>
      </Dialog>
    </div>

    <template v-if="loading">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card v-for="i in 2" :key="i">
          <CardContent class="pt-6 space-y-3">
            <Skeleton class="h-5 w-32" />
            <Skeleton class="h-8 w-40" />
            <Skeleton class="h-4 w-24" />
          </CardContent>
        </Card>
      </div>
    </template>

    <template v-else-if="hasFatalLoadError">
      <Card class="border-red-500/30 bg-red-500/5">
        <CardContent class="space-y-3 pt-6">
          <p class="font-semibold text-red-500">Não foi possível carregar contas</p>
          <p class="text-sm text-muted-foreground">
            {{ loadErrorMessage || 'Verifique o servidor/API e tente novamente.' }}
          </p>
          <p v-if="staleDataMessage" class="text-xs text-yellow-500">
            {{ staleDataMessage }}
          </p>
          <Button :disabled="refreshing || isProcessing" @click="loadPageData">
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
          <p class="text-sm text-muted-foreground">
            {{ loadErrorMessage }} Alguns dados podem estar incompletos.
          </p>
          <Button variant="outline" :disabled="refreshing || isProcessing" @click="loadPageData">
            {{ refreshing ? 'Atualizando...' : 'Tentar novamente' }}
          </Button>
        </CardContent>
      </Card>

      <div v-if="accountsStore.accounts.length" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          v-for="acc in accountsStore.accounts"
          :key="acc.id"
          class="gap-3 py-3 border-border/70 bg-gradient-to-br from-card to-card/70 shadow-sm hover:shadow-md transition-shadow"
        >
          <CardContent class="px-4">
            <div class="flex items-start justify-between">
              <div class="space-y-0.5">
                <p class="font-semibold text-base">{{ acc.label }}</p>
                <div class="flex items-center gap-1.5">
                  <span class="h-2 w-2 rounded-full shrink-0" :class="getBankIdentity(acc.bank).dotColor" />
                  <p class="text-xs capitalize" :class="getBankIdentity(acc.bank).color">{{ acc.bank }}</p>
                </div>
              </div>
              <div class="flex items-center gap-1">
                <Button variant="ghost" size="icon" :disabled="isProcessing" @click="openEdit(acc)">
                  <Pencil class="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-red-500 hover:text-red-500"
                  :disabled="isProcessing"
                  @click="requestDelete(acc)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              class="mt-3 grid gap-3"
              :class="hasCompleteCreditCardConfig(acc) ? 'grid-cols-2' : 'grid-cols-1'"
            >
              <div class="rounded-md border border-border/60 bg-background/30 px-3 py-2">
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Saldo</p>
                <p class="text-lg font-semibold leading-tight" :class="acc.balance_cents >= 0 ? 'text-green-500' : 'text-red-500'">
                  {{ formatCentsToBRL(acc.balance_cents) }}
                </p>
              </div>

              <div
                class="rounded-md border border-border/60 bg-background/30 px-3 py-2"
                v-if="hasCompleteCreditCardConfig(acc)"
              >
                <p class="text-[10px] uppercase tracking-wide text-muted-foreground">Fatura</p>
                <p
                  class="text-lg font-semibold leading-tight"
                  :class="getCreditInvoiceCents(acc.id) < 0 ? 'text-red-500' : 'text-muted-foreground'"
                >
                  {{ formatCentsToBRL(getCreditInvoiceCents(acc.id)) }}
                </p>
              </div>
            </div>

            <div v-if="hasCompleteCreditCardConfig(acc)" class="flex gap-3 mt-3 text-[11px] text-muted-foreground">
              <span>Fechamento: dia {{ acc.card_closing_day }}</span>
              <span>Vencimento: dia {{ acc.card_due_day }}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card v-else>
        <CardContent class="py-8">
          <p class="text-center text-muted-foreground">Nenhuma conta cadastrada.</p>
        </CardContent>
      </Card>
    </template>

    <ConfirmDialog
      :open="deleteConfirmOpen"
      title="Excluir conta?"
      :description="deleteDescription"
      confirm-label="Sim, excluir conta"
      cancel-label="Cancelar"
      :loading="deleting"
      :destructive="true"
      @confirm="confirmDeleteAccount"
      @cancel="cancelDeleteAccount"
    />
    <div
      v-if="isProcessing && !showDeleteAccountModal"
      class="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/45 backdrop-blur-[1px]"
    >
      <Spinner class="h-5 w-5" />
    </div>

    <div
      v-if="showDeleteAccountModal"
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
            <Progress :model-value="deleteAccountProgressPercent" class="h-2" />
            <p class="text-sm font-medium">{{ deleteAccountProgressLabel }}</p>
            <p class="text-xs text-muted-foreground">{{ deleteAccountProgressMeta }}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>

