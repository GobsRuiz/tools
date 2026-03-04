<script setup lang="ts">
import { ChevronDown, ChevronRight, Filter, ChevronsUpDown, X, MoreHorizontal, Pencil, Trash2, Eye } from 'lucide-vue-next'
import type { Transaction, Recurrent } from '~~/schemas/zod-schemas'
import { useMovimentacoesState, type MovimentacoesTab } from '~/composables/useMovimentacoesState'
import { formatCentsToBRL } from '~/utils/money'
import { getInvestmentEventTypeLabel, getInvestmentEventValueColorClass } from '~/utils/investment-events'

const props = withDefaults(defineProps<{
  initialTab?: MovimentacoesTab
}>(), {
  initialTab: 'transacoes',
})

const emit = defineEmits<{
  'edit-transaction': [tx: Transaction]
  'edit-recurrent': [rec: Recurrent]
  'tab-change': [tab: MovimentacoesTab]
}>()

const {
  accountsStore, investmentPositionsStore,
  txFiltersOpen, recFiltersOpen, invFiltersOpen,
  activeTab,
  txFilterConta, txFilterMes, txFilterStatus,
  recFilterConta, recFilterStatus,
  invFilterConta,
  investmentEventDialogOpen, editingInvestmentEvent,
  savingInvestmentEvent,
  investmentEventForm, investmentEventTypeOptions,
  availableSellQuantity, selectedInvestmentPosition,
  expandedParents,
  viewingTransaction, transactionViewDialogOpen,
  viewingRecurrent, recurrentViewDialogOpen,
  isProcessing, processingAction,
  showDeleteInstallmentModal,
  deleteInstallmentProgress, deleteInstallmentTotal,
  deleteInstallmentPercent, deleteInstallmentCurrentStep,
  deleteInstallmentCurrentLabel, deleteInstallmentStepMeta,
  confirmDeleteOpen, deleteTarget,
  txStatusOptions, recStatusOptions, pageSizeOptions,
  hasTxFilters, hasRecFilters, hasInvFilters,
  filteredTransactions, filteredRecurrents, filteredInvestments,
  txPageSize, txPage, txGoToPage,
  txTotalItems, txTotalPages,
  txPageStart, txPageEnd,
  paginatedTransactions,
  recPageSize, recPage, recGoToPage,
  recTotalItems, recTotalPages,
  recPageStart, recPageEnd,
  paginatedRecurrents,
  invPageSize, invPage, invGoToPage,
  invTotalItems, invTotalPages,
  invPageStart, invPageEnd,
  paginatedInvestments,
  getAccountLabel, getTransactionDisplayAmountCents,
  getPositionLabel, getPositionBucketLabel, formatDisplayDate,
  formatCentsToInput, formatQuantityDisplay,
  canMarkUnpaidTransaction,
  toggleExpand,
  openViewTransaction, openViewRecurrent,
  editTransaction, editRecurrent,
  requestDelete, requestDeleteTransaction,
  markTransactionUnpaid,
  openEditInvestmentEvent,
  onInvestmentEventDialogOpenChange,
  cancelDelete, confirmDelete,
  clearTxFilters, clearRecFilters, clearInvFilters,
  setTxPage, setRecPage, setInvPage,
  submitTxGoToPage, submitRecGoToPage, submitInvGoToPage,
  submitInvestmentEvent,
  focusTransaction, focusRecurrent,
} = useMovimentacoesState(props, emit)

defineExpose({
  focusTransaction,
  focusRecurrent,
})
</script>

<template>
  <div class="relative">
  <div :class="isProcessing ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'">
  <Card>
    <CardContent class="pt-6 space-y-4">
      <!-- Tabs por tipo -->
      <Tabs v-model="activeTab">
        <TabsList class="w-full justify-start">
          <TabsTrigger value="transacoes" :disabled="isProcessing">
            Transações
            <Badge v-if="filteredTransactions.length" variant="secondary" class="ml-2 text-xs">
              {{ filteredTransactions.length }}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="recorrentes" :disabled="isProcessing">
            Recorrentes
            <Badge v-if="filteredRecurrents.length" variant="secondary" class="ml-2 text-xs">
              {{ filteredRecurrents.length }}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="investimentos" :disabled="isProcessing">
            Investimentos
            <Badge v-if="filteredInvestments.length" variant="secondary" class="ml-2 text-xs">
              {{ filteredInvestments.length }}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <!-- TAB TRANSACOES -->
        <TabsContent value="transacoes">
          <!-- Filtros Transações -->
          <Collapsible v-model:open="txFiltersOpen" class="mb-4">
            <CollapsibleTrigger as-child>
              <Button variant="ghost" size="sm" class="flex items-center gap-2 w-full justify-between">
                <span class="flex items-center gap-2">
                  <Filter class="h-4 w-4" />
                  Filtros
                </span>
                <ChevronsUpDown class="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-3">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Select v-model="txFilterConta">
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="null">Todas</SelectItem>
                    <SelectItem v-for="acc in accountsStore.accounts" :key="acc.id" :value="acc.id">
                      {{ acc.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Input v-model="txFilterMes" type="month" placeholder="Mês" />

                <Select v-model="txFilterStatus">
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in txStatusOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="txPageSize">
                  <SelectTrigger>
                    <SelectValue placeholder="Itens por página" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="size in pageSizeOptions" :key="`tx-page-size-${size}`" :value="size">
                      {{ size }} / página
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                v-if="hasTxFilters"
                variant="ghost"
                size="sm"
                class="gap-2 mt-2 ml-auto"
                @click="clearTxFilters"
              >
                <X class="h-4 w-4" />
                Limpar filtros
              </Button>
            </CollapsibleContent>
          </Collapsible>
          <Table v-if="txTotalItems">
            <TableHeader>
              <TableRow>
                <TableHead class="w-8"></TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Método</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead class="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <template v-for="tx in paginatedTransactions" :key="tx.id">
                <TableRow
                  class="cursor-pointer"
                  @click="tx.installment ? toggleExpand(tx.installment.parentId) : openViewTransaction(tx)"
                >
                  <TableCell>
                    <button v-if="tx.installment" type="button" class="text-muted-foreground">
                      <ChevronDown v-if="expandedParents.has(tx.installment.parentId)" class="h-4 w-4" />
                      <ChevronRight v-else class="h-4 w-4" />
                    </button>
                  </TableCell>
                  <TableCell :class="tx.type === 'income' ? 'text-green-500' : tx.type === 'transfer' ? 'text-blue-500' : 'text-red-500'">
                    {{ formatCentsToBRL(getTransactionDisplayAmountCents(tx)) }}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" :class="tx.type === 'income' ? 'text-green-500 border-green-500/30' : tx.type === 'transfer' ? 'text-blue-500 border-blue-500/30' : 'text-red-500 border-red-500/30'">
                      {{ tx.type === 'expense' ? 'Despesa' : tx.type === 'income' ? 'Receita' : 'Transferência' }}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <template v-if="tx.type === 'transfer' && tx.destinationAccountId">
                      <span class="text-xs">{{ getAccountLabel(tx.accountId) }} → {{ getAccountLabel(tx.destinationAccountId) }}</span>
                    </template>
                    <template v-else>{{ getAccountLabel(tx.accountId) }}</template>
                  </TableCell>
                  <TableCell>
                    <Badge v-if="tx.payment_method === 'credit'" variant="secondary">Crédito</Badge>
                    <Badge v-else-if="tx.payment_method === 'debit'" variant="secondary">Débito</Badge>
                    <span v-else class="text-muted-foreground">—</span>
                  </TableCell>
                  <TableCell>
                    <Badge v-if="tx.paid" variant="outline" class="text-green-500 border-green-500/30">Pago</Badge>
                    <Badge v-else variant="outline" class="text-yellow-500 border-yellow-500/30">Pendente</Badge>
                  </TableCell>
                  <TableCell>{{ formatDisplayDate(tx.date) }}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon" class="h-8 w-8" :disabled="isProcessing" @click.stop>
                          <MoreHorizontal class="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem :disabled="isProcessing" @click.stop="openViewTransaction(tx)">
                          <Eye class="h-4 w-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem :disabled="isProcessing" @click.stop="editTransaction(tx)">
                          <Pencil class="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          v-if="canMarkUnpaidTransaction(tx)"
                          :disabled="isProcessing"
                          @click.stop="markTransactionUnpaid(tx)"
                        >
                          <X class="h-4 w-4 mr-2" />
                          Desfazer pagamento
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          :disabled="isProcessing"
                          variant="destructive"
                          @click.stop="requestDeleteTransaction(tx)"
                        >
                          <Trash2 class="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                <!-- Parcelas expandidas -->
                <TableRow v-if="tx.installment && expandedParents.has(tx.installment.parentId)" :key="`${tx.id}-expand`">
                  <TableCell colspan="8" class="p-0 pt-0 pb-2">
                    <ParcelasExpansion :parent-id="tx.installment.parentId" />
                  </TableCell>
                </TableRow>
              </template>
            </TableBody>
          </Table>
          <div v-if="txTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="text-sm text-muted-foreground">
              Mostrando {{ txPageStart }}-{{ txPageEnd }} de {{ txTotalItems }} itens
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="txPage <= 1" @click="setTxPage(txPage - 1)">
                Anterior
              </Button>
              <Button variant="outline" size="sm" :disabled="txPage >= txTotalPages" @click="setTxPage(txPage + 1)">
                Próxima
              </Button>
              <Input
                v-model="txGoToPage"
                type="number"
                min="1"
                :max="txTotalPages"
                placeholder="Página"
                class="h-8 w-24"
                @keyup.enter="submitTxGoToPage"
              />
              <Button variant="secondary" size="sm" @click="submitTxGoToPage">
                Ir
              </Button>
            </div>
          </div>
          <p v-else class="text-center text-muted-foreground py-8">
            Nenhuma transação encontrada.
          </p>
        </TabsContent>

        <!-- TAB RECORRENTES -->
        <TabsContent value="recorrentes">
          <!-- Filtros Recorrentes -->
          <Collapsible v-model:open="recFiltersOpen" class="mb-4">
            <CollapsibleTrigger as-child>
              <Button variant="ghost" size="sm" class="flex items-center gap-2 w-full justify-between">
                <span class="flex items-center gap-2">
                  <Filter class="h-4 w-4" />
                  Filtros
                </span>
                <ChevronsUpDown class="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-3">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Select v-model="recFilterConta">
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="null">Todas</SelectItem>
                    <SelectItem v-for="acc in accountsStore.accounts" :key="acc.id" :value="acc.id">
                      {{ acc.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="recFilterStatus">
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="opt in recStatusOptions" :key="opt.value" :value="opt.value">
                      {{ opt.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="recPageSize">
                  <SelectTrigger>
                    <SelectValue placeholder="Itens por página" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="size in pageSizeOptions" :key="`rec-page-size-${size}`" :value="size">
                      {{ size }} / página
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                v-if="hasRecFilters"
                variant="ghost"
                size="sm"
                class="gap-2 mt-2 ml-auto"
                @click="clearRecFilters"
              >
                <X class="h-4 w-4" />
                Limpar filtros
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Table v-if="recTotalItems">
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Dia</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notificar</TableHead>
                <TableHead class="text-right">Valor</TableHead>
                <TableHead class="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="rec in paginatedRecurrents"
                :key="rec.id"
                class="cursor-pointer"
                @click="openViewRecurrent(rec)"
              >
                <TableCell>{{ rec.name }}</TableCell>
                <TableCell>
                  <Badge variant="outline" :class="rec.kind === 'expense' ? 'text-red-500 border-red-500/30' : 'text-green-500 border-green-500/30'">{{ rec.kind === 'expense' ? 'Despesa' : 'Receita' }}</Badge>
                </TableCell>
                <TableCell>{{ getAccountLabel(rec.accountId) }}</TableCell>
                <TableCell>{{ rec.due_day ?? rec.day_of_month ?? '—' }}</TableCell>
                <TableCell>
                  <Badge v-if="rec.active" variant="outline" class="text-green-500 border-green-500/30">Ativo</Badge>
                  <Badge v-else variant="outline" class="text-muted-foreground">Inativo</Badge>
                </TableCell>
                <TableCell>
                  <Badge v-if="rec.notify" variant="outline" class="text-blue-500 border-blue-500/30">Sim</Badge>
                  <Badge v-else variant="outline" class="text-muted-foreground">Não</Badge>
                </TableCell>
                <TableCell class="text-right" :class="rec.amount_cents < 0 ? 'text-red-500' : 'text-green-500'">
                  {{ formatCentsToBRL(rec.amount_cents) }}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                      <DropdownMenuTrigger as-child>
                        <Button variant="ghost" size="icon" class="h-8 w-8" :disabled="isProcessing" @click.stop>
                          <MoreHorizontal class="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                      <DropdownMenuItem :disabled="isProcessing" @click.stop="openViewRecurrent(rec)">
                        <Eye class="h-4 w-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem :disabled="isProcessing" @click.stop="editRecurrent(rec)">
                        <Pencil class="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        :disabled="isProcessing"
                        variant="destructive"
                        @click.stop="requestDelete('recurrent', rec.id, rec.name)"
                      >
                        <Trash2 class="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-if="recTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="text-sm text-muted-foreground">
              Mostrando {{ recPageStart }}-{{ recPageEnd }} de {{ recTotalItems }} itens
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="recPage <= 1" @click="setRecPage(recPage - 1)">
                Anterior
              </Button>
              <Button variant="outline" size="sm" :disabled="recPage >= recTotalPages" @click="setRecPage(recPage + 1)">
                Próxima
              </Button>
              <Input
                v-model="recGoToPage"
                type="number"
                min="1"
                :max="recTotalPages"
                placeholder="Página"
                class="h-8 w-24"
                @keyup.enter="submitRecGoToPage"
              />
              <Button variant="secondary" size="sm" @click="submitRecGoToPage">
                Ir
              </Button>
            </div>
          </div>
          <p v-else class="text-center text-muted-foreground py-8">
            Nenhuma recorrente encontrada.
          </p>
        </TabsContent>

        <!-- TAB INVESTIMENTOS -->
        <TabsContent value="investimentos">
          <!-- Filtros Investimentos -->
          <Collapsible v-model:open="invFiltersOpen" class="mb-4">
            <CollapsibleTrigger as-child>
              <Button variant="ghost" size="sm" class="flex items-center gap-2 w-full justify-between">
                <span class="flex items-center gap-2">
                  <Filter class="h-4 w-4" />
                  Filtros
                </span>
                <ChevronsUpDown class="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent class="pt-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Select v-model="invFilterConta">
                  <SelectTrigger>
                    <SelectValue placeholder="Conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="null">Todas</SelectItem>
                    <SelectItem v-for="acc in accountsStore.accounts" :key="acc.id" :value="acc.id">
                      {{ acc.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select v-model="invPageSize">
                  <SelectTrigger>
                    <SelectValue placeholder="Itens por página" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="size in pageSizeOptions" :key="`inv-page-size-${size}`" :value="size">
                      {{ size }} / página
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                v-if="hasInvFilters"
                variant="ghost"
                size="sm"
                class="gap-2 mt-2 ml-auto"
                @click="clearInvFilters"
              >
                <X class="h-4 w-4" />
                Limpar filtros
              </Button>
            </CollapsibleContent>
          </Collapsible>

          <Table v-if="invTotalItems">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Conta</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead class="text-right">Qtd</TableHead>
                <TableHead class="text-right">Preço Unit.</TableHead>
                <TableHead class="text-right">Valor</TableHead>
                <TableHead class="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="inv in paginatedInvestments" :key="inv.id">
                <TableCell>{{ formatDisplayDate(inv.date) }}</TableCell>
                <TableCell>{{ getPositionLabel(inv.positionId) }}</TableCell>
                <TableCell><Badge variant="secondary">{{ getPositionBucketLabel(inv.positionId) }}</Badge></TableCell>
                <TableCell>{{ getAccountLabel(inv.accountId) }}</TableCell>
                <TableCell><Badge variant="outline">{{ inv.event_type }}</Badge></TableCell>
                <TableCell class="text-right">{{ inv.quantity ?? '—' }}</TableCell>
                <TableCell class="text-right">{{ inv.unit_price_cents ? formatCentsToBRL(inv.unit_price_cents) : '—' }}</TableCell>
                <TableCell class="text-right">{{ formatCentsToBRL(inv.amount_cents) }}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-8 w-8" :disabled="isProcessing">
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem :disabled="isProcessing" @click.stop="openEditInvestmentEvent(inv)">
                        <Pencil class="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        :disabled="isProcessing"
                        variant="destructive"
                        @click.stop="requestDelete('investment-event', inv.id, getPositionLabel(inv.positionId))"
                      >
                        <Trash2 class="h-4 w-4 mr-2" />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          <div v-if="invTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="text-sm text-muted-foreground">
              Mostrando {{ invPageStart }}-{{ invPageEnd }} de {{ invTotalItems }} itens
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="invPage <= 1" @click="setInvPage(invPage - 1)">
                Anterior
              </Button>
              <Button variant="outline" size="sm" :disabled="invPage >= invTotalPages" @click="setInvPage(invPage + 1)">
                Próxima
              </Button>
              <Input
                v-model="invGoToPage"
                type="number"
                min="1"
                :max="invTotalPages"
                placeholder="Página"
                class="h-8 w-24"
                @keyup.enter="submitInvGoToPage"
              />
              <Button variant="secondary" size="sm" @click="submitInvGoToPage">
                Ir
              </Button>
            </div>
          </div>
          <p v-else class="text-center text-muted-foreground py-8">
            Nenhum investimento encontrado.
          </p>
        </TabsContent>
      </Tabs>
    </CardContent>
  </Card>
  </div>
  <div
    v-if="isProcessing && !showDeleteInstallmentModal"
    class="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/45 backdrop-blur-[1px]"
  >
    <Spinner class="h-5 w-5" />
  </div>

  <!-- Modal de bloqueio com progresso -->
  <div
    v-if="showDeleteInstallmentModal"
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
          <Progress :model-value="deleteInstallmentPercent" class="h-2" />
          <p class="text-sm font-medium">{{ deleteInstallmentCurrentLabel }}</p>
          <p class="text-xs text-muted-foreground">{{ deleteInstallmentStepMeta }}</p>
        </CardContent>
      </Card>
    </div>
  </div>
  <!-- Modal Visualizacao Transacao -->
  <Dialog v-model:open="transactionViewDialogOpen">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Detalhes da Transação</DialogTitle>
        <DialogDescription>Informações completas da movimentação</DialogDescription>
      </DialogHeader>
      <div v-if="viewingTransaction" class="space-y-4 text-sm">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</p>
            <p class="mt-1 text-lg font-semibold" :class="viewingTransaction.type === 'income' ? 'text-green-500' : 'text-red-500'">
              {{ formatCentsToBRL(viewingTransaction.amount_cents) }}
            </p>
          </div>

          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</p>
            <p class="mt-1 font-medium">{{ viewingTransaction.type === 'expense' ? 'Despesa' : viewingTransaction.type === 'income' ? 'Receita' : 'Transferência' }}</p>
          </div>
          <div v-if="viewingTransaction.type !== 'transfer'" class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Método</p>
            <p class="mt-1 font-medium">{{ viewingTransaction.payment_method === 'credit' ? 'Crédito' : viewingTransaction.payment_method === 'debit' ? 'Débito' : '—' }}</p>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <div class="mt-1">
              <Badge v-if="viewingTransaction.paid" variant="outline" class="text-green-500 border-green-500/30">Pago</Badge>
              <Badge v-else variant="outline" class="text-yellow-500 border-yellow-500/30">Pendente</Badge>
            </div>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Data</p>
            <p class="mt-1 font-medium">{{ formatDisplayDate(viewingTransaction.date) }}</p>
          </div>
          <div v-if="viewingTransaction.type === 'transfer' && viewingTransaction.destinationAccountId" class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta Origem</p>
            <p class="mt-1 font-medium">{{ getAccountLabel(viewingTransaction.accountId) }}</p>
          </div>
          <div v-if="viewingTransaction.type === 'transfer' && viewingTransaction.destinationAccountId" class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta Destino</p>
            <p class="mt-1 font-medium">{{ getAccountLabel(viewingTransaction.destinationAccountId) }}</p>
          </div>
          <div v-if="viewingTransaction.type !== 'transfer'" class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta</p>
            <p class="mt-1 font-medium">{{ getAccountLabel(viewingTransaction.accountId) }}</p>
          </div>
        </div>

        <div class="space-y-2">
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Descrição</p>
            <p class="mt-1 font-medium">{{ viewingTransaction.description || '—' }}</p>
          </div>


          <div v-if="viewingTransaction.installment" class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Parcela</p>
            <p class="mt-1 font-medium">{{ viewingTransaction.installment.index }}/{{ viewingTransaction.installment.total }} — {{ viewingTransaction.installment.product }}</p>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Modal Visualização Recorrente -->
  <Dialog v-model:open="recurrentViewDialogOpen">
    <DialogContent class="max-w-lg">
      <DialogHeader>
        <DialogTitle>Detalhes da Recorrente</DialogTitle>
        <DialogDescription>Informações completas da movimentação</DialogDescription>
      </DialogHeader>
      <div v-if="viewingRecurrent" class="space-y-4 text-sm">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</p>
            <p class="mt-1 text-lg font-semibold" :class="viewingRecurrent.amount_cents < 0 ? 'text-red-500' : 'text-green-500'">
              {{ formatCentsToBRL(viewingRecurrent.amount_cents) }}
            </p>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</p>
            <p class="mt-1 font-medium">{{ viewingRecurrent.kind === 'expense' ? 'Despesa' : 'Receita' }}</p>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Status</p>
            <div class="mt-1">
              <Badge v-if="viewingRecurrent.active" variant="outline" class="text-green-500 border-green-500/30">Ativo</Badge>
              <Badge v-else variant="outline" class="text-muted-foreground">Inativo</Badge>
            </div>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Frequência</p>
            <p class="mt-1 font-medium">{{ viewingRecurrent.frequency === 'monthly' ? 'Mensal' : viewingRecurrent.frequency }}</p>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Vencimento</p>
            <p class="mt-1 font-medium">{{ viewingRecurrent.due_day ?? viewingRecurrent.day_of_month ?? '—' }}</p>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta</p>
            <p class="mt-1 font-medium">{{ getAccountLabel(viewingRecurrent.accountId) }}</p>
          </div>
        </div>

        <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Nome</p>
          <p class="mt-1 font-medium">{{ viewingRecurrent.name }}</p>
        </div>

        <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Descrição</p>
          <p class="mt-1 font-medium">{{ viewingRecurrent.description || '—' }}</p>
        </div>
      </div>
    </DialogContent>
  </Dialog>

  <!-- Modal Edicao Evento de Investimento -->
  <Dialog :open="investmentEventDialogOpen" @update:open="onInvestmentEventDialogOpenChange">
    <DialogContent class="max-w-2xl" :show-close-button="!savingInvestmentEvent">
      <DialogHeader>
        <DialogTitle>Editar Lancamento</DialogTitle>
        <DialogDescription>Atualize os dados do evento de investimento.</DialogDescription>
      </DialogHeader>

      <div
        class="grid grid-cols-2 gap-4"
        :class="savingInvestmentEvent ? 'pointer-events-none opacity-70 transition-opacity' : 'transition-opacity'"
      >
        <div class="col-span-2 space-y-2">
          <Label>Ativo *</Label>
          <Select v-model="investmentEventForm.positionId">
            <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
            <SelectContent>
              <SelectItem v-for="position in investmentPositionsStore.positions" :key="position.id" :value="position.id">
                {{ getPositionLabel(position.id) }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <template v-if="investmentEventForm.positionId">
          <div class="space-y-2">
            <Label>Data *</Label>
            <Input v-model="investmentEventForm.date" type="date" />
          </div>

          <div class="space-y-2">
            <Label>Evento *</Label>
            <Select v-model="investmentEventForm.event_type">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="opt in investmentEventTypeOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="selectedInvestmentPosition?.bucket === 'variable' && (investmentEventForm.event_type === 'buy' || investmentEventForm.event_type === 'sell')">
            <div class="space-y-2">
              <Label>Quantidade *</Label>
              <Input v-model="investmentEventForm.quantity" placeholder="Ex: 10" />
              <p
                v-if="investmentEventForm.event_type === 'sell'"
                class="text-xs text-muted-foreground"
              >
                Disponivel: {{ formatQuantityDisplay(availableSellQuantity) }} cotas
              </p>
            </div>
            <div class="space-y-2">
              <Label>Preco unitario</Label>
              <MoneyInput v-model="investmentEventForm.unit_price" />
            </div>
          </template>

          <div class="space-y-2">
            <Label>Valor total *</Label>
            <MoneyInput v-model="investmentEventForm.amount" />
          </div>

          <div class="col-span-2 space-y-2">
            <Label>Observação</Label>
            <Input v-model="investmentEventForm.note" placeholder="Opcional" />
          </div>
        </template>
      </div>

      <Button class="w-full" :disabled="isProcessing" @click="submitInvestmentEvent">
        <Spinner v-if="savingInvestmentEvent" class="h-4 w-4 mr-2" />
        {{ savingInvestmentEvent ? 'Salvando...' : 'Atualizar Lancamento' }}
      </Button>
    </DialogContent>
  </Dialog>

  <!-- Confirm Delete Dialog -->
  <ConfirmDialog
    :open="confirmDeleteOpen"
    title="Excluir item?"
    :description="`Deseja excluir '${deleteTarget?.label}'? Esta ação não pode ser desfeita.`"
    confirm-label="Sim, excluir"
    cancel-label="Cancelar"
    :loading="processingAction === 'delete'"
    :destructive="true"
    @confirm="confirmDelete"
    @cancel="cancelDelete"
  />
  </div>
</template>

