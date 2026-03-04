<script setup lang="ts">
import { CandlestickChart, Plus, MoreHorizontal, Eye, Pencil, Trash2 } from 'lucide-vue-next'
import { useInvestmentPageState } from '~/composables/useInvestmentPageState'
import { formatCentsToBRL } from '~/utils/money'

const {
  positionsStore,
  activeBucket,
  loading, refreshing,
  hasPartialLoadError, hasFatalLoadError,
  loadErrorMessage, staleDataMessage,
  isProcessing,
  positionDialogOpen, eventDialogOpen,
  positionViewDialogOpen, eventViewDialogOpen,
  editingPosition, editingEvent,
  viewingPosition, viewingEvent,
  confirmDeleteOpen, deleteTarget, deleting,
  showDeletePositionProgressModal,
  deletePositionProgressStep, deletePositionProgressLabel,
  deletePositionProgressPercent, deletePositionProgressMeta,
  positionForm, eventForm,
  investmentTypeOptions, filteredTypes, pageSizeOptions, eventTypeOptions,
  requiresAssetCode,
  positionDialogTitle, eventDialogTitle,
  editingPositionHasEvents,
  variablePositions, fixedPositions,
  selectedPosition, availableSellQuantity,
  filteredEvents,
  variablePageSize, variablePage, variableGoToPage,
  variableTotalItems, variableTotalPages,
  variablePageStart, variablePageEnd,
  paginatedVariablePositions, submitVariableGoToPage,
  fixedPageSize, fixedPage, fixedGoToPage,
  fixedTotalItems, fixedTotalPages,
  fixedPageStart, fixedPageEnd,
  paginatedFixedPositions, submitFixedGoToPage,
  eventsPageSize, eventsPage, eventsGoToPage,
  eventsTotalItems, eventsTotalPages,
  eventsPageStart, eventsPageEnd,
  paginatedEvents, submitEventsGoToPage,
  viewingPositionEvents, viewingPositionTimeline,
  viewingCaixinhaSummary, viewingVariableSummary,
  showDetailedEvolution, viewingTimelineTitle,
  timelineChartData, timelineStartDate, timelineEndDate,
  getAccountLabel, getPositionLabel, getPositionDisplay,
  getInvestmentTypeLabel, getEventTypeLabel,
  isOutflowEventType, getEventValueColorClass,
  formatCentsToInput, formatQuantityDisplay,
  positionHasEvents, getPositionEventsCount,
  getEventSignedValueCents,
  loadPageData,
  openNewPosition, openEditPosition, openViewPosition,
  openNewEvent, openEditEvent, openViewEvent,
  requestDeletePosition, requestDeleteEvent,
  cancelDelete, confirmDelete,
  onPositionDialogOpenChange, onEventDialogOpenChange,
  submitPosition, submitEvent,
} = useInvestmentPageState()
</script>

<template>
  <div class="relative space-y-6">
    <div :class="isProcessing ? 'pointer-events-none opacity-60 transition-opacity' : 'transition-opacity'">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <CandlestickChart class="h-6 w-6 text-muted-foreground" />
        <h1 class="text-2xl font-bold">Investimentos</h1>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" :disabled="isProcessing" @click="openNewPosition">
          <Plus class="h-4 w-4 mr-2" />
          Novo Ativo
        </Button>
        <Button :disabled="isProcessing" @click="openNewEvent">
          <Plus class="h-4 w-4 mr-2" />
          Novo Lancamento
        </Button>
      </div>
    </div>

    <template v-if="loading">
      <Card>
        <CardContent class="pt-6 space-y-2">
          <Skeleton v-for="i in 6" :key="i" class="h-10 w-full" />
        </CardContent>
      </Card>
    </template>

    <template v-else-if="hasFatalLoadError">
      <Card class="border-red-500/30 bg-red-500/5">
        <CardContent class="space-y-3 pt-6">
          <p class="font-semibold text-red-500">Não foi possível carregar investimentos</p>
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

      <Tabs v-model="activeBucket" className="mb-4">
        <TabsList>
          <TabsTrigger value="variable">Renda Variavel</TabsTrigger>
          <TabsTrigger value="fixed">Renda Fixa</TabsTrigger>
        </TabsList>

        <TabsContent value="variable" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Carteira Variavel</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="mb-3 flex items-center justify-end gap-2">
                <span class="text-sm text-muted-foreground">Itens por pagina</span>
                <Select v-model="variablePageSize">
                  <SelectTrigger class="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="size in pageSizeOptions" :key="`variable-page-size-${size}`" :value="size">
                      {{ size }} / pagina
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Table v-if="variableTotalItems">
                <TableHeader>
                  <TableRow>
                    <TableHead>Ativo</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead class="text-right">Qtd</TableHead>
                    <TableHead class="text-right">Custo Medio</TableHead>
                    <TableHead class="text-right">Investido</TableHead>
                    <TableHead class="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="p in paginatedVariablePositions"
                    :key="p.id"
                    class="cursor-pointer"
                    @click="openViewPosition(p)"
                  >
                    <TableCell><Badge>{{ p.asset_code }}</Badge></TableCell>
                    <TableCell>{{ getAccountLabel(p.accountId) }}</TableCell>
                    <TableCell class="text-right">{{ p.quantity_total ?? 0 }}</TableCell>
                    <TableCell class="text-right">{{ p.avg_cost_cents ? formatCentsToBRL(p.avg_cost_cents) : '—' }}</TableCell>
                    <TableCell class="text-right">{{ formatCentsToBRL(p.invested_cents) }}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <Button variant="ghost" size="icon" class="h-8 w-8" @click.stop>
                            <MoreHorizontal class="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem @click="openViewPosition(p)">
                            <Eye class="h-4 w-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem @click="openEditPosition(p)">
                            <Pencil class="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            @click="requestDeletePosition(p)"
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
              <div v-if="variableTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p class="text-sm text-muted-foreground">
                  Mostrando {{ variablePageStart }}-{{ variablePageEnd }} de {{ variableTotalItems }} itens
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" :disabled="variablePage <= 1" @click="setVariablePage(variablePage - 1)">
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" :disabled="variablePage >= variableTotalPages" @click="setVariablePage(variablePage + 1)">
                    Proxima
                  </Button>
                  <Input
                    v-model="variableGoToPage"
                    type="number"
                    min="1"
                    :max="variableTotalPages"
                    placeholder="Pagina"
                    class="h-8 w-24"
                    @keyup.enter="submitVariableGoToPage"
                  />
                  <Button variant="secondary" size="sm" @click="submitVariableGoToPage">
                    Ir
                  </Button>
                </div>
              </div>
              <p v-else class="text-center text-muted-foreground py-6">Sem posicoes de renda variavel.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fixed" class="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Carteira Fixa</CardTitle>
            </CardHeader>
            <CardContent>
              <div class="mb-3 flex items-center justify-end gap-2">
                <span class="text-sm text-muted-foreground">Itens por pagina</span>
                <Select v-model="fixedPageSize">
                  <SelectTrigger class="h-8 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem v-for="size in pageSizeOptions" :key="`fixed-page-size-${size}`" :value="size">
                      {{ size }} / pagina
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Table v-if="fixedTotalItems">
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Indexador</TableHead>
                    <TableHead>Taxa</TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead class="text-right">Total</TableHead>
                    <TableHead class="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="p in paginatedFixedPositions"
                    :key="p.id"
                    class="cursor-pointer"
                    @click="openViewPosition(p)"
                  >
                    <TableCell>
                      <template v-if="p.investment_type === 'caixinha'">
                        {{ p.name ?? 'Caixinha' }}
                      </template>
                      <template v-else>
                        <Badge>{{ p.asset_code }}</Badge> {{ p.name ?? '—' }}
                      </template>
                    </TableCell>
                    <TableCell>{{ getAccountLabel(p.accountId) }}</TableCell>
                    <TableCell>{{ p.metadata?.indexer ?? '—' }}</TableCell>
                    <TableCell>
                      <template v-if="p.metadata?.rate_percent != null">
                        {{ p.metadata.rate_percent }}{{ p.metadata?.rate_mode === 'pct_cdi' ? '% CDI' : '% a.a.' }}
                      </template>
                      <template v-else>—</template>
                    </TableCell>
                    <TableCell>{{ p.metadata?.maturity_date ?? '—' }}</TableCell>
                    <TableCell class="text-right">{{ formatCentsToBRL(p.current_value_cents ?? p.invested_cents ?? p.principal_cents ?? 0) }}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <Button variant="ghost" size="icon" class="h-8 w-8" @click.stop>
                            <MoreHorizontal class="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem @click="openViewPosition(p)">
                            <Eye class="h-4 w-4 mr-2" />
                            Visualizar
                          </DropdownMenuItem>
                          <DropdownMenuItem @click="openEditPosition(p)">
                            <Pencil class="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            variant="destructive"
                            @click="requestDeletePosition(p)"
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
              <div v-if="fixedTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <p class="text-sm text-muted-foreground">
                  Mostrando {{ fixedPageStart }}-{{ fixedPageEnd }} de {{ fixedTotalItems }} itens
                </p>
                <div class="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" :disabled="fixedPage <= 1" @click="setFixedPage(fixedPage - 1)">
                    Anterior
                  </Button>
                  <Button variant="outline" size="sm" :disabled="fixedPage >= fixedTotalPages" @click="setFixedPage(fixedPage + 1)">
                    Proxima
                  </Button>
                  <Input
                    v-model="fixedGoToPage"
                    type="number"
                    min="1"
                    :max="fixedTotalPages"
                    placeholder="Pagina"
                    class="h-8 w-24"
                    @keyup.enter="submitFixedGoToPage"
                  />
                  <Button variant="secondary" size="sm" @click="submitFixedGoToPage">
                    Ir
                  </Button>
                </div>
              </div>
              <p v-else class="text-center text-muted-foreground py-6">Sem posicoes de renda fixa.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle>Lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="mb-3 flex items-center justify-end gap-2">
            <span class="text-sm text-muted-foreground">Itens por pagina</span>
            <Select v-model="eventsPageSize">
              <SelectTrigger class="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="size in pageSizeOptions" :key="`events-page-size-${size}`" :value="size">
                  {{ size }} / pagina
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Table v-if="eventsTotalItems">
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Ativo</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead v-if="activeBucket === 'variable'" class="text-right">Qtd</TableHead>
                <TableHead v-if="activeBucket === 'variable'" class="text-right">Preco Unit.</TableHead>
                <TableHead class="text-right">Valor</TableHead>
                <TableHead class="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="e in paginatedEvents"
                :key="e.id"
                class="cursor-pointer"
                @click="openViewEvent(e)"
              >
                <TableCell>{{ e.date }}</TableCell>
                <TableCell>{{ getPositionLabel(e.positionId) }}</TableCell>
                <TableCell><Badge variant="secondary">{{ getEventTypeLabel(e.event_type) }}</Badge></TableCell>
                <TableCell v-if="activeBucket === 'variable'" class="text-right">{{ e.quantity ?? '—' }}</TableCell>
                <TableCell v-if="activeBucket === 'variable'" class="text-right">{{ e.unit_price_cents ? formatCentsToBRL(e.unit_price_cents) : '—' }}</TableCell>
                <TableCell
                  class="text-right"
                  :class="getEventValueColorClass(e.event_type)"
                >
                  {{ formatCentsToBRL(getEventSignedValueCents(e)) }}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger as-child>
                      <Button variant="ghost" size="icon" class="h-8 w-8" @click.stop>
                        <MoreHorizontal class="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem @click="openViewEvent(e)">
                        <Eye class="h-4 w-4 mr-2" />
                        Visualizar
                      </DropdownMenuItem>
                      <DropdownMenuItem @click="openEditEvent(e)">
                        <Pencil class="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        @click="requestDeleteEvent(e)"
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
          <div v-if="eventsTotalItems" class="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p class="text-sm text-muted-foreground">
              Mostrando {{ eventsPageStart }}-{{ eventsPageEnd }} de {{ eventsTotalItems }} itens
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" :disabled="eventsPage <= 1" @click="setEventsPage(eventsPage - 1)">
                Anterior
              </Button>
              <Button variant="outline" size="sm" :disabled="eventsPage >= eventsTotalPages" @click="setEventsPage(eventsPage + 1)">
                Proxima
              </Button>
              <Input
                v-model="eventsGoToPage"
                type="number"
                min="1"
                :max="eventsTotalPages"
                placeholder="Pagina"
                class="h-8 w-24"
                @keyup.enter="submitEventsGoToPage"
              />
              <Button variant="secondary" size="sm" @click="submitEventsGoToPage">
                Ir
              </Button>
            </div>
          </div>
          <p v-else class="text-center text-muted-foreground py-6">Sem lancamentos nesse grupo.</p>
        </CardContent>
      </Card>
    </template>

    </div>

    <div
      v-if="isProcessing"
      class="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/45 backdrop-blur-[1px]"
    >
      <Spinner class="h-5 w-5" />
    </div>

    <Dialog :open="positionDialogOpen" @update:open="onPositionDialogOpenChange">
      <DialogContent class="max-w-2xl" :show-close-button="!savingPosition">
        <DialogHeader>
          <DialogTitle>{{ positionDialogTitle }}</DialogTitle>
          <DialogDescription>
            {{ editingPosition ? 'Atualize os dados do ativo.' : 'Cadastre a caixinha do ativo/produto.' }}
          </DialogDescription>
        </DialogHeader>

        <div :class="savingPosition ? 'pointer-events-none opacity-70 transition-opacity' : 'transition-opacity'">
          <Alert v-if="editingPositionHasEvents" variant="default">
            <AlertDescription>
              Conta e grupo ficam bloqueados porque esse ativo ja possui lancamentos.
            </AlertDescription>
          </Alert>

          <div class="grid grid-cols-2 gap-4">
          <div class="space-y-2">
            <Label>Conta *</Label>
            <Select v-model="positionForm.accountId">
              <SelectTrigger :disabled="editingPositionHasEvents"><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="acc in accountsStore.accounts" :key="acc.id" :value="acc.id">{{ acc.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Grupo *</Label>
            <Select v-model="positionForm.bucket">
              <SelectTrigger :disabled="editingPositionHasEvents"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="variable">Renda Variavel</SelectItem>
                <SelectItem value="fixed">Renda Fixa</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="space-y-2">
            <Label>Tipo *</Label>
            <Select v-model="positionForm.investment_type">
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="t in filteredTypes" :key="t.value" :value="t.value">{{ t.label }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div v-if="requiresAssetCode" class="space-y-2">
            <Label>Codigo *</Label>
            <Input v-model="positionForm.asset_code" placeholder="Ex: MXRF11 ou CDB-INTER-2028" />
          </div>

          <div class="col-span-2 space-y-2" v-if="positionForm.bucket === 'fixed'">
            <Label>Nome</Label>
            <Input v-model="positionForm.name" placeholder="Ex: CDB Inter 2028 (opcional)" />
          </div>

          <template v-if="positionForm.bucket === 'fixed'">
            <div class="space-y-2">
              <Label>Emissor</Label>
              <Input v-model="positionForm.issuer" placeholder="Ex: Banco Inter" />
            </div>
            <div class="space-y-2">
              <Label>Indexador</Label>
              <Select v-model="positionForm.indexer">
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CDI">CDI</SelectItem>
                  <SelectItem value="IPCA">IPCA</SelectItem>
                  <SelectItem value="PRE">Pre</SelectItem>
                  <SelectItem value="SELIC">Selic</SelectItem>
                  <SelectItem value="OUTRO">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>Tipo da taxa</Label>
              <Select v-model="positionForm.rate_mode">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pct_cdi">% do CDI</SelectItem>
                  <SelectItem value="annual_percent">% a.a.</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label>{{ positionForm.rate_mode === 'pct_cdi' ? 'Taxa (% do CDI)' : 'Taxa (% a.a.)' }}</Label>
              <Input v-model="positionForm.rate_percent" placeholder="Ex: 120" />
            </div>
            <div class="space-y-2">
              <Label>Vencimento (opcional)</Label>
              <Input v-model="positionForm.maturity_date" type="date" />
            </div>
          </template>
          </div>
        </div>

        <Button class="w-full" :disabled="isProcessing" @click="submitPosition">
          <Spinner v-if="savingPosition" class="h-4 w-4 mr-2" />
          {{ savingPosition ? 'Salvando...' : (editingPosition ? 'Atualizar Ativo' : 'Salvar Ativo') }}
        </Button>
      </DialogContent>
    </Dialog>

    <Dialog :open="eventDialogOpen" @update:open="onEventDialogOpenChange">
      <DialogContent class="max-w-2xl" :show-close-button="!savingEvent">
        <DialogHeader>
          <DialogTitle>{{ eventDialogTitle }}</DialogTitle>
          <DialogDescription>
            {{ editingEvent ? 'Atualize os dados do lancamento.' : 'Registre compra, aporte, rendimento ou resgate.' }}
          </DialogDescription>
        </DialogHeader>

        <div
          class="grid grid-cols-2 gap-4"
          :class="savingEvent ? 'pointer-events-none opacity-70 transition-opacity' : 'transition-opacity'"
        >
          <div class="col-span-2 space-y-2">
            <Label>Ativo *</Label>
            <Select v-model="eventForm.positionId">
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in positionsStore.positions" :key="p.id" :value="p.id">
                  {{ getPositionDisplay(p) }}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <template v-if="eventForm.positionId">
            <div class="space-y-2">
              <Label>Data *</Label>
              <Input v-model="eventForm.date" type="date" />
            </div>

            <div class="space-y-2">
              <Label>Evento *</Label>
              <Select v-model="eventForm.event_type">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="opt in eventTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <template v-if="selectedPosition?.bucket === 'variable' && (eventForm.event_type === 'buy' || eventForm.event_type === 'sell')">
              <div class="space-y-2">
                <Label>Quantidade *</Label>
                <Input v-model="eventForm.quantity" placeholder="Ex: 10" />
                <p
                  v-if="eventForm.event_type === 'sell'"
                  class="text-xs text-muted-foreground"
                >
                  Disponivel: {{ formatQuantityDisplay(availableSellQuantity) }} cotas
                </p>
              </div>
              <div class="space-y-2">
                <Label>Preco unitario</Label>
                <MoneyInput v-model="eventForm.unit_price" />
              </div>
            </template>

            <div class="space-y-2">
              <Label>Valor total *</Label>
              <MoneyInput v-model="eventForm.amount" />
            </div>


            <div class="col-span-2 space-y-2">
              <Label>Observação</Label>
              <Input v-model="eventForm.note" placeholder="Opcional" />
            </div>
          </template>
        </div>

        <Button class="w-full" :disabled="isProcessing" @click="submitEvent">
          <Spinner v-if="savingEvent" class="h-4 w-4 mr-2" />
          {{ savingEvent ? 'Salvando...' : (editingEvent ? 'Atualizar Lancamento' : 'Salvar Lancamento') }}
        </Button>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="positionViewDialogOpen">
      <DialogContent class="sm:max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes do Ativo</DialogTitle>
          <DialogDescription>Informacoes completas do ativo.</DialogDescription>
        </DialogHeader>
        <div v-if="viewingPosition" class="space-y-4 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Ativo</p>
              <p class="mt-1 font-medium">{{ getPositionDisplay(viewingPosition) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Tipo</p>
              <p class="mt-1 font-medium">{{ getInvestmentTypeLabel(viewingPosition.investment_type) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Grupo</p>
              <p class="mt-1 font-medium">{{ viewingPosition.bucket === 'variable' ? 'Renda Variavel' : 'Renda Fixa' }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta</p>
              <p class="mt-1 font-medium">{{ getAccountLabel(viewingPosition.accountId) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Lancamentos</p>
              <p class="mt-1 font-medium">{{ getPositionEventsCount(viewingPosition.id) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Investido</p>
              <p class="mt-1 font-medium">{{ formatCentsToBRL(viewingPosition.invested_cents) }}</p>
            </div>
          </div>

          <div v-if="showDetailedEvolution" class="space-y-3">
            <div v-if="viewingPosition.investment_type === 'caixinha'" class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Aportes</p>
                <p class="mt-1 font-medium text-green-500">+{{ formatCentsToBRL(viewingCaixinhaSummary.contributionsCents) }}</p>
              </div>
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Rendimentos</p>
                <p class="mt-1 font-medium text-blue-500">+{{ formatCentsToBRL(viewingCaixinhaSummary.incomeCents) }}</p>
              </div>
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Saidas</p>
                <p class="mt-1 font-medium text-red-500">-{{ formatCentsToBRL(viewingCaixinhaSummary.outflowCents) }}</p>
              </div>
            </div>

            <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Compras</p>
                <p class="mt-1 font-medium text-green-500">+{{ formatCentsToBRL(viewingVariableSummary.buyCents) }}</p>
              </div>
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Vendas</p>
                <p class="mt-1 font-medium text-red-500">-{{ formatCentsToBRL(viewingVariableSummary.sellCents) }}</p>
              </div>
              <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Rendimentos</p>
                <p class="mt-1 font-medium text-blue-500">+{{ formatCentsToBRL(viewingVariableSummary.incomeCents) }}</p>
              </div>
            </div>

            <div class="rounded-md border border-border/60 bg-muted/20 p-3">
              <div class="mb-2 flex items-center justify-between">
                <p class="text-[11px] uppercase tracking-wide text-muted-foreground">{{ viewingTimelineTitle }}</p>
                <p class="text-sm font-medium">{{ formatCentsToBRL(viewingPosition.current_value_cents ?? viewingPosition.invested_cents ?? 0) }}</p>
              </div>
              <div v-if="viewingPositionTimeline.length">
                <svg viewBox="0 0 620 150" class="h-36 w-full">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2.5"
                    class="text-primary"
                    :points="timelineChartData.points"
                  />
                </svg>
                <div class="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{{ timelineStartDate }}</span>
                  <span>Min: {{ formatCentsToBRL(timelineChartData.min) }}</span>
                  <span>Max: {{ formatCentsToBRL(timelineChartData.max) }}</span>
                  <span>{{ timelineEndDate }}</span>
                </div>
              </div>
              <p v-else class="text-xs text-muted-foreground">Sem eventos para montar a evolucao.</p>
            </div>

            <div class="rounded-md border border-border/60 bg-muted/20 p-3">
              <p class="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Todos os Lancamentos</p>
              <Table v-if="viewingPositionTimeline.length">
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Evento</TableHead>
                    <TableHead v-if="viewingPosition.bucket === 'variable'" class="text-right">Qtd</TableHead>
                    <TableHead class="text-right">Valor</TableHead>
                    <TableHead class="text-right">Saldo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="item in viewingPositionTimeline" :key="item.event.id">
                    <TableCell>{{ item.event.date }}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{{ getEventTypeLabel(item.event.event_type) }}</Badge>
                    </TableCell>
                    <TableCell v-if="viewingPosition.bucket === 'variable'" class="text-right">
                      {{ item.event.quantity ?? '—' }}
                    </TableCell>
                    <TableCell
                      class="text-right"
                      :class="item.event.event_type === 'income'
                        ? 'text-blue-500'
                        : (item.signedValueCents >= 0 ? 'text-green-500' : 'text-red-500')"
                    >
                      {{ item.signedValueCents >= 0 ? '+' : '-' }}{{ formatCentsToBRL(Math.abs(item.signedValueCents)) }}
                    </TableCell>
                    <TableCell class="text-right font-medium">
                      {{ formatCentsToBRL(item.balanceCents) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
              <p v-else class="text-xs text-muted-foreground">Nenhum lancamento para este ativo.</p>
            </div>
          </div>

          <div v-if="viewingPosition.bucket === 'variable'" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Quantidade</p>
              <p class="mt-1 font-medium">{{ viewingPosition.quantity_total ?? 0 }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Custo Medio</p>
              <p class="mt-1 font-medium">{{ viewingPosition.avg_cost_cents ? formatCentsToBRL(viewingPosition.avg_cost_cents) : '—' }}</p>
            </div>
          </div>

          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Indexador</p>
              <p class="mt-1 font-medium">{{ viewingPosition.metadata?.indexer ?? '—' }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Taxa</p>
              <p class="mt-1 font-medium">
                <template v-if="viewingPosition.metadata?.rate_percent != null">
                  {{ viewingPosition.metadata.rate_percent }}{{ viewingPosition.metadata?.rate_mode === 'pct_cdi' ? '% CDI' : '% a.a.' }}
                </template>
                <template v-else>—</template>
              </p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Vencimento</p>
              <p class="mt-1 font-medium">{{ viewingPosition.metadata?.maturity_date ?? '—' }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Emissor</p>
              <p class="mt-1 font-medium">{{ viewingPosition.metadata?.issuer ?? '—' }}</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <Dialog v-model:open="eventViewDialogOpen">
      <DialogContent class="max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes do Lancamento</DialogTitle>
          <DialogDescription>Informacoes completas do lancamento.</DialogDescription>
        </DialogHeader>
        <div v-if="viewingEvent" class="space-y-4 text-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Data</p>
              <p class="mt-1 font-medium">{{ viewingEvent.date }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Evento</p>
              <p class="mt-1 font-medium">{{ getEventTypeLabel(viewingEvent.event_type) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Ativo</p>
              <p class="mt-1 font-medium">{{ getPositionLabel(viewingEvent.positionId) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2 sm:col-span-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Conta</p>
              <p class="mt-1 font-medium">{{ getAccountLabel(viewingEvent.accountId) }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Quantidade</p>
              <p class="mt-1 font-medium">{{ viewingEvent.quantity ?? '—' }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Preco Unitario</p>
              <p class="mt-1 font-medium">{{ viewingEvent.unit_price_cents ? formatCentsToBRL(viewingEvent.unit_price_cents) : '—' }}</p>
            </div>
            <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
              <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Valor</p>
              <p class="mt-1 font-medium">{{ formatCentsToBRL(viewingEvent.amount_cents) }}</p>
            </div>
          </div>
          <div class="rounded-md border border-border/60 bg-muted/20 px-3 py-2">
            <p class="text-[11px] uppercase tracking-wide text-muted-foreground">Observação</p>
            <p class="mt-1 font-medium">{{ viewingEvent.note || '—' }}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <div
      v-if="showDeletePositionProgressModal"
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
            <Progress :model-value="deletePositionProgressPercent" class="h-2" />
            <p class="text-sm font-medium">{{ deletePositionProgressLabel }}</p>
            <p class="text-xs text-muted-foreground">{{ deletePositionProgressMeta }}</p>
          </CardContent>
        </Card>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmDeleteOpen"
      title="Excluir item?"
      :description="`Deseja excluir '${deleteTarget?.label}'? Esta ação não pode ser desfeita.`"
      confirm-label="Sim, excluir"
      cancel-label="Cancelar"
      :loading="deleting"
      :destructive="true"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>
