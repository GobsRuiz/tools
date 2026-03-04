import { useAccountsStore } from '~/stores/useAccounts'
import { useInvestmentPositionsStore } from '~/stores/useInvestmentPositions'
import { useInvestmentEventsStore } from '~/stores/useInvestmentEvents'
import { useAppToast } from '~/composables/useAppToast'
import { usePageLoadState } from '~/composables/usePageLoadState'
import { usePagination } from '~/composables/usePagination'
import {
  formatCentsToPtBrInput,
  formatQuantityPtBr,
  getEffectiveAvailableQuantityForSell,
  getInvestmentEventTypeLabel,
  getInvestmentEventValueColorClass,
  investmentEventTypeOptionsFixed,
  investmentEventTypeOptionsVariable,
  isOutflowInvestmentEventType,
} from '~/utils/investment-events'
import { parseBRLToCents, formatCentsToBRL } from '~/utils/money'
import { nowISO } from '~/utils/dates'
import { getErrorMessage } from '~/utils/error'
import type { InvestmentPosition, InvestmentEvent } from '~~/schemas/zod-schemas'

export function useInvestmentPageState() {
  const accountsStore = useAccountsStore()
  const positionsStore = useInvestmentPositionsStore()
  const eventsStore = useInvestmentEventsStore()
  const appToast = useAppToast()
  const route = useRoute()
  const router = useRouter()

  const activeBucket = ref<'variable' | 'fixed'>('variable')

  const {
    loading,
    refreshing,
    beginAttempt,
    completeAttempt,
    hasCurrentAttemptFatal,
    hasPartialLoadError,
    loadErrorMessage,
    staleDataMessage,
  } = usePageLoadState()

  const sourceLoaders = [
    { label: 'contas', load: () => accountsStore.loadAccounts() },
    { label: 'posicoes de investimentos', load: () => positionsStore.loadPositions() },
    { label: 'eventos de investimentos', load: () => eventsStore.loadEvents() },
  ]

  // ── Dialog states ──

  const positionDialogOpen = ref(false)
  const eventDialogOpen = ref(false)
  const positionViewDialogOpen = ref(false)
  const eventViewDialogOpen = ref(false)

  const editingPosition = ref<InvestmentPosition | null>(null)
  const editingEvent = ref<InvestmentEvent | null>(null)
  const viewingPosition = ref<InvestmentPosition | null>(null)
  const viewingEvent = ref<InvestmentEvent | null>(null)

  const confirmDeleteOpen = ref(false)
  const deleteTarget = ref<{ type: 'position' | 'event'; id: string; label: string } | null>(null)
  const deleting = ref(false)
  const savingPosition = ref(false)
  const savingEvent = ref(false)
  const isProcessing = computed(() => deleting.value || savingPosition.value || savingEvent.value)
  const showDeletePositionProgressModal = ref(false)
  const deletePositionProgressStep = ref(0)
  const deletePositionProgressLabel = ref('')

  const DELETE_POSITION_PROGRESS_STEPS = [
    'Excluindo eventos de investimento...',
    'Ajustando saldos...',
    'Removendo ativo...',
    'Concluido!',
  ]

  const deletePositionProgressPercent = computed(() => {
    const total = DELETE_POSITION_PROGRESS_STEPS.length
    if (!total) return 0
    const current = Math.min(deletePositionProgressStep.value + 1, total)
    return Math.round((current / total) * 100)
  })

  const deletePositionProgressMeta = computed(() => {
    const total = DELETE_POSITION_PROGRESS_STEPS.length
    if (!total) return ''
    const current = Math.min(deletePositionProgressStep.value + 1, total)
    return `Etapa ${current} de ${total}`
  })

  // ── Forms ──

  const positionForm = reactive({
    accountId: null as number | null,
    bucket: 'variable' as 'variable' | 'fixed',
    investment_type: 'fii' as InvestmentPosition['investment_type'],
    asset_code: '',
    name: '',
    issuer: '',
    indexer: '' as '' | 'CDI' | 'IPCA' | 'PRE' | 'SELIC' | 'OUTRO',
    rate_mode: 'pct_cdi' as 'annual_percent' | 'pct_cdi',
    rate_percent: '',
    maturity_date: '',
    liquidity: '' as '' | 'D0' | 'D1' | 'NO_VENCIMENTO' | 'OUTRA',
  })

  const eventForm = reactive({
    positionId: '',
    date: nowISO(),
    event_type: 'buy' as 'buy' | 'sell' | 'income' | 'contribution' | 'withdrawal' | 'maturity',
    quantity: '',
    unit_price: '',
    amount: '',
    note: '',
  })

  // ── Computed ──

  const hasFatalLoadError = computed(() => hasCurrentAttemptFatal.value)

  const investmentTypeOptions = [
    { label: 'FII', value: 'fii', bucket: 'variable' },
    { label: 'Criptomoeda', value: 'cripto', bucket: 'variable' },
    { label: 'CDB', value: 'cdb', bucket: 'fixed' },
    { label: 'CDI', value: 'cdi', bucket: 'fixed' },
    { label: 'LCI', value: 'lci', bucket: 'fixed' },
    { label: 'LCA', value: 'lca', bucket: 'fixed' },
    { label: 'Tesouro Direto', value: 'tesouro', bucket: 'fixed' },
    { label: 'Caixinha', value: 'caixinha', bucket: 'fixed' },
    { label: 'Outro', value: 'outro', bucket: 'fixed' },
  ] as const

  const filteredTypes = computed(() =>
    investmentTypeOptions.filter(t => t.bucket === positionForm.bucket),
  )

  const requiresAssetCode = computed(() =>
    positionForm.investment_type !== 'caixinha',
  )

  const positionDialogTitle = computed(() =>
    editingPosition.value ? 'Editar Ativo' : 'Novo Ativo',
  )

  const eventDialogTitle = computed(() =>
    editingEvent.value ? 'Editar Lancamento' : 'Novo Lancamento',
  )

  const editingPositionHasEvents = computed(() =>
    editingPosition.value ? positionHasEvents(editingPosition.value.id) : false,
  )

  const variablePositions = computed(() =>
    positionsStore.positions.filter(p => p.bucket === 'variable'),
  )

  const fixedPositions = computed(() =>
    positionsStore.positions.filter(p => p.bucket === 'fixed'),
  )

  const selectedPosition = computed(() =>
    positionsStore.positions.find(p => p.id === eventForm.positionId),
  )

  const availableSellQuantity = computed(() => {
    const position = selectedPosition.value
    if (!position || position.bucket !== 'variable') return 0
    return getEffectiveAvailableQuantityForSell(position, editingEvent.value)
  })

  const eventTypeOptions = computed(() => {
    const position = selectedPosition.value
    if (position?.bucket === 'fixed') {
      if (position.investment_type === 'caixinha') {
        return investmentEventTypeOptionsFixed.filter(opt => opt.value !== 'maturity')
      }
      return investmentEventTypeOptionsFixed
    }
    return investmentEventTypeOptionsVariable
  })

  const filteredEvents = computed(() =>
    eventsStore.events
      .filter(e => {
        const position = positionsStore.positions.find(p => p.id === e.positionId)
        return activeBucket.value === 'variable'
          ? position?.bucket === 'variable'
          : position?.bucket === 'fixed'
      })
      .sort((a, b) => b.date.localeCompare(a.date)),
  )

  const pageSizeOptions = [10, 20, 40, 70, 100] as const

  // ── Pagination ──

  const {
    pageSize: variablePageSize,
    page: variablePage,
    goToPage: variableGoToPage,
    totalItems: variableTotalItems,
    totalPages: variableTotalPages,
    pageStart: variablePageStart,
    pageEnd: variablePageEnd,
    paginatedItems: paginatedVariablePositions,
    setPage: setVariablePage,
    submitGoToPage: submitVariableGoToPage,
  } = usePagination(variablePositions, 40)

  const {
    pageSize: fixedPageSize,
    page: fixedPage,
    goToPage: fixedGoToPage,
    totalItems: fixedTotalItems,
    totalPages: fixedTotalPages,
    pageStart: fixedPageStart,
    pageEnd: fixedPageEnd,
    paginatedItems: paginatedFixedPositions,
    setPage: setFixedPage,
    submitGoToPage: submitFixedGoToPage,
  } = usePagination(fixedPositions, 40)

  const {
    pageSize: eventsPageSize,
    page: eventsPage,
    goToPage: eventsGoToPage,
    totalItems: eventsTotalItems,
    totalPages: eventsTotalPages,
    pageStart: eventsPageStart,
    pageEnd: eventsPageEnd,
    paginatedItems: paginatedEvents,
    setPage: setEventsPage,
    submitGoToPage: submitEventsGoToPage,
    resetPage: resetEventsPage,
  } = usePagination(filteredEvents, 40)

  // ── Watches ──

  watch(() => positionForm.bucket, (bucket) => {
    positionForm.investment_type = bucket === 'variable' ? 'fii' : 'cdb'
  })

  watch(() => positionForm.investment_type, (type) => {
    if (type === 'caixinha') {
      positionForm.asset_code = ''
    }
  })

  watch(() => eventForm.positionId, () => {
    const position = selectedPosition.value
    if (!position) return

    const validTypes = position.bucket === 'fixed'
      ? ['contribution', 'withdrawal', 'income', 'maturity']
      : ['buy', 'sell', 'income']

    if (!validTypes.includes(eventForm.event_type)) {
      eventForm.event_type = position.bucket === 'fixed' ? 'contribution' : 'buy'
    }
  })

  watch(() => [eventForm.quantity, eventForm.unit_price], () => {
    if (!selectedPosition.value || selectedPosition.value.bucket !== 'variable') return
    if (!eventForm.quantity || !eventForm.unit_price) return

    const qty = Number(eventForm.quantity.replace(',', '.'))
    if (!Number.isFinite(qty) || qty <= 0) return
    const cents = parseBRLToCents(eventForm.unit_price)
    eventForm.amount = formatCentsToBRL(Math.round(qty * cents))
  })

  watch(activeBucket, () => {
    resetEventsPage()
  })

  watch(
    () => [route.query.positionId, route.query.bucket, loading.value],
    () => {
      if (loading.value) return
      void applyRouteFocusFromQuery()
    },
    { immediate: true },
  )

  watch(positionDialogOpen, (open) => {
    if (!open) {
      editingPosition.value = null
      resetPositionForm()
    }
  })

  watch(eventDialogOpen, (open) => {
    if (!open) {
      editingEvent.value = null
      resetEventForm()
    }
  })

  // ── Viewing computed ──

  const viewingPositionEvents = computed(() => {
    if (!viewingPosition.value) return [] as InvestmentEvent[]
    return eventsStore.events
      .filter(event => event.positionId === viewingPosition.value!.id)
      .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)))
  })

  const viewingPositionTimeline = computed(() => {
    const position = viewingPosition.value
    if (!position) {
      return [] as Array<{
        event: InvestmentEvent
        signedValueCents: number
        balanceCents: number
      }>
    }

    if (position.bucket === 'variable') {
      let quantity = 0
      let totalCostCents = 0

      return viewingPositionEvents.value.map((event) => {
        const signedValueCents = getEventSignedValueCents(event)

        if (event.event_type === 'buy') {
          const qty = event.quantity ?? 0
          const buyCost = Math.abs(event.amount_cents)
          quantity += qty
          totalCostCents += buyCost
        } else if (event.event_type === 'sell') {
          const qty = event.quantity ?? 0
          if (qty > 0 && quantity > 0) {
            const avgCost = totalCostCents / quantity
            const costReduction = Math.round(avgCost * qty)
            totalCostCents = Math.max(0, totalCostCents - costReduction)
            quantity = Math.max(0, quantity - qty)
          }
        }

        return {
          event,
          signedValueCents,
          balanceCents: Math.max(0, totalCostCents),
        }
      })
    }

    let running = 0
    return viewingPositionEvents.value.map((event) => {
      const signedValueCents = getEventSignedValueCents(event)
      running += signedValueCents
      return {
        event,
        signedValueCents,
        balanceCents: Math.max(0, running),
      }
    })
  })

  const viewingCaixinhaSummary = computed(() => {
    let contributionsCents = 0
    let incomeCents = 0
    let outflowCents = 0

    for (const event of viewingPositionEvents.value) {
      if (event.event_type === 'contribution') {
        contributionsCents += Math.abs(event.amount_cents)
        continue
      }
      if (event.event_type === 'income') {
        incomeCents += Math.abs(event.amount_cents)
        continue
      }
      if (event.event_type === 'withdrawal' || event.event_type === 'maturity') {
        outflowCents += Math.abs(event.amount_cents)
      }
    }

    return { contributionsCents, incomeCents, outflowCents }
  })

  const viewingVariableSummary = computed(() => {
    let buyCents = 0
    let sellCents = 0
    let incomeCents = 0

    for (const event of viewingPositionEvents.value) {
      if (event.event_type === 'buy') {
        buyCents += Math.abs(event.amount_cents)
        continue
      }
      if (event.event_type === 'sell') {
        sellCents += Math.abs(event.amount_cents)
        continue
      }
      if (event.event_type === 'income') {
        incomeCents += Math.abs(event.amount_cents)
      }
    }

    return { buyCents, sellCents, incomeCents }
  })

  const showDetailedEvolution = computed(() =>
    !!viewingPosition.value && (viewingPosition.value.investment_type === 'caixinha' || viewingPosition.value.bucket === 'variable'),
  )

  const viewingTimelineTitle = computed(() =>
    viewingPosition.value?.investment_type === 'caixinha'
      ? 'Evolucao da Caixinha'
      : 'Evolucao do Ativo',
  )

  const timelineChartData = computed(() => {
    const values = viewingPositionTimeline.value.map(item => item.balanceCents)
    if (!values.length) return { points: '', min: 0, max: 0 }

    const min = Math.min(...values)
    const max = Math.max(...values)
    const width = 620
    const height = 150
    const padX = 14
    const padY = 10
    const step = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0
    const range = max - min || 1

    const points = values
      .map((value, index) => {
        const x = padX + index * step
        const y = padY + (height - padY * 2) * (1 - (value - min) / range)
        return `${x},${y}`
      })
      .join(' ')

    return { points, min, max }
  })

  const timelineStartDate = computed(() =>
    viewingPositionTimeline.value[0]?.event.date ?? '—',
  )

  const timelineEndDate = computed(() =>
    viewingPositionTimeline.value[viewingPositionTimeline.value.length - 1]?.event.date ?? '—',
  )

  // ── Helper functions ──

  function parseBucketQuery(value: unknown): 'variable' | 'fixed' | null {
    if (typeof value !== 'string') return null
    if (value === 'variable' || value === 'fixed') return value
    return null
  }

  function parseStringQuery(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value
    if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim()) return value[0]
    return null
  }

  function getAccountLabel(accountId: number) {
    return accountsStore.accounts.find(a => a.id === accountId)?.label ?? '—'
  }

  function getPositionDisplay(position: InvestmentPosition) {
    if (position.investment_type === 'caixinha') {
      return position.name?.trim() || 'Caixinha'
    }
    return position.name?.trim() ? `${position.asset_code} · ${position.name}` : position.asset_code
  }

  function getPositionLabel(positionId: string) {
    const position = positionsStore.positions.find(p => p.id === positionId)
    if (!position) return '—'
    return getPositionDisplay(position)
  }

  function getInvestmentTypeLabel(type: InvestmentPosition['investment_type']) {
    return investmentTypeOptions.find(opt => opt.value === type)?.label ?? type
  }

  function positionHasEvents(positionId: string) {
    return eventsStore.events.some(event => event.positionId === positionId)
  }

  function getPositionEventsCount(positionId: string) {
    return eventsStore.events.filter(event => event.positionId === positionId).length
  }

  function getEventSignedValueCents(event: InvestmentEvent) {
    if (event.event_type === 'buy' || event.event_type === 'contribution' || event.event_type === 'income') {
      return Math.abs(event.amount_cents)
    }
    if (event.event_type === 'sell' || event.event_type === 'withdrawal' || event.event_type === 'maturity') {
      return -Math.abs(event.amount_cents)
    }
    return 0
  }

  // ── Aliases (used by template) ──

  const getEventTypeLabel = getInvestmentEventTypeLabel
  const isOutflowEventType = isOutflowInvestmentEventType
  const getEventValueColorClass = getInvestmentEventValueColorClass
  const formatCentsToInput = formatCentsToPtBrInput
  const formatQuantityDisplay = formatQuantityPtBr

  // ── Form resets ──

  function resetPositionForm() {
    positionForm.accountId = null
    positionForm.bucket = 'variable'
    positionForm.investment_type = 'fii'
    positionForm.asset_code = ''
    positionForm.name = ''
    positionForm.issuer = ''
    positionForm.indexer = ''
    positionForm.rate_mode = 'pct_cdi'
    positionForm.rate_percent = ''
    positionForm.maturity_date = ''
    positionForm.liquidity = ''
  }

  function resetEventForm() {
    eventForm.positionId = ''
    eventForm.date = nowISO()
    eventForm.event_type = 'buy'
    eventForm.quantity = ''
    eventForm.unit_price = ''
    eventForm.amount = ''
    eventForm.note = ''
  }

  // ── Dialog openers ──

  function openNewPosition() {
    if (isProcessing.value) return
    editingPosition.value = null
    resetPositionForm()
    positionDialogOpen.value = true
  }

  function openEditPosition(position: InvestmentPosition) {
    if (isProcessing.value) return
    editingPosition.value = position
    positionForm.accountId = position.accountId
    positionForm.bucket = position.bucket
    positionForm.investment_type = position.investment_type
    positionForm.asset_code = position.investment_type === 'caixinha' ? '' : position.asset_code
    positionForm.name = position.name ?? ''
    positionForm.issuer = position.metadata?.issuer ?? ''
    positionForm.indexer = position.metadata?.indexer ?? ''
    positionForm.rate_mode = position.metadata?.rate_mode ?? 'pct_cdi'
    positionForm.rate_percent = position.metadata?.rate_percent != null
      ? String(position.metadata.rate_percent).replace('.', ',')
      : ''
    positionForm.maturity_date = position.metadata?.maturity_date ?? ''
    positionForm.liquidity = position.metadata?.liquidity ?? ''
    positionDialogOpen.value = true
  }

  function openViewPosition(position: InvestmentPosition) {
    if (isProcessing.value) return
    viewingPosition.value = position
    positionViewDialogOpen.value = true
  }

  function openNewEvent() {
    if (isProcessing.value) return
    editingEvent.value = null
    resetEventForm()
    eventDialogOpen.value = true
  }

  function openEditEvent(event: InvestmentEvent) {
    if (isProcessing.value) return
    editingEvent.value = event
    eventForm.positionId = event.positionId
    eventForm.date = event.date
    eventForm.event_type = event.event_type
    eventForm.quantity = event.quantity != null ? String(event.quantity).replace('.', ',') : ''
    eventForm.unit_price = formatCentsToInput(event.unit_price_cents)
    eventForm.amount = formatCentsToInput(event.amount_cents)
    eventForm.note = event.note ?? ''
    eventDialogOpen.value = true
  }

  function openViewEvent(event: InvestmentEvent) {
    if (isProcessing.value) return
    viewingEvent.value = event
    eventViewDialogOpen.value = true
  }

  // ── Delete handlers ──

  function requestDeletePosition(position: InvestmentPosition) {
    if (isProcessing.value) return
    deleteTarget.value = {
      type: 'position',
      id: position.id,
      label: getPositionDisplay(position),
    }
    confirmDeleteOpen.value = true
  }

  function requestDeleteEvent(event: InvestmentEvent) {
    if (isProcessing.value) return
    deleteTarget.value = {
      type: 'event',
      id: event.id,
      label: `${getPositionLabel(event.positionId)} · ${event.date}`,
    }
    confirmDeleteOpen.value = true
  }

  function cancelDelete() {
    if (isProcessing.value) return
    confirmDeleteOpen.value = false
    deleteTarget.value = null
  }

  function startDeletePositionProgress() {
    deletePositionProgressStep.value = 0
    deletePositionProgressLabel.value = DELETE_POSITION_PROGRESS_STEPS[0] ?? ''
    showDeletePositionProgressModal.value = true
  }

  function setDeletePositionProgress(stepIndex: number, label?: string) {
    const maxIndex = Math.max(0, DELETE_POSITION_PROGRESS_STEPS.length - 1)
    deletePositionProgressStep.value = Math.min(Math.max(stepIndex, 0), maxIndex)
    if (label) {
      deletePositionProgressLabel.value = label
      return
    }
    deletePositionProgressLabel.value = DELETE_POSITION_PROGRESS_STEPS[deletePositionProgressStep.value] ?? ''
  }

  function resetDeletePositionProgress() {
    showDeletePositionProgressModal.value = false
    deletePositionProgressStep.value = 0
    deletePositionProgressLabel.value = ''
  }

  async function deletePositionWithEvents(positionId: string) {
    const result = await eventsStore.deletePositionCascade(positionId, {
      onProgress: ({ deleted, total }: { deleted: number; total: number }) => {
        setDeletePositionProgress(0, `Excluindo eventos de investimento... (${deleted}/${total})`)
      },
    })
    setDeletePositionProgress(1, 'Aplicando exclusao atomica...')
    return result
  }

  async function confirmDelete() {
    if (!deleteTarget.value || isProcessing.value) return
    deleting.value = true

    try {
      if (deleteTarget.value.type === 'position') {
        confirmDeleteOpen.value = false
        startDeletePositionProgress()
        const deleted = await deletePositionWithEvents(deleteTarget.value.id)
        setDeletePositionProgress(2)
        setDeletePositionProgress(3)
        appToast.success({
          title: 'Ativo excluido',
          description: `${deleted.deleted} evento(s) removido(s) em lote.`,
        })
      } else {
        await eventsStore.deleteEvent(deleteTarget.value.id)
        appToast.success({ title: 'Lancamento excluido' })
      }
    } catch (e: unknown) {
      appToast.error({
        title: 'Erro ao excluir',
        description: getErrorMessage(e, 'Nao foi possivel excluir.'),
      })
    } finally {
      resetDeletePositionProgress()
      deleting.value = false
      confirmDeleteOpen.value = false
      deleteTarget.value = null
    }
  }

  function onPositionDialogOpenChange(open: boolean) {
    if (!open && savingPosition.value) return
    positionDialogOpen.value = open
  }

  function onEventDialogOpenChange(open: boolean) {
    if (!open && savingEvent.value) return
    eventDialogOpen.value = open
  }

  // ── Route focus ──

  async function applyRouteFocusFromQuery() {
    if (loading.value) return

    const positionId = parseStringQuery(route.query.positionId)
    if (!positionId) return

    const position = positionsStore.positions.find(item => item.id === positionId)
    if (!position) return

    const routeBucket = parseBucketQuery(route.query.bucket)
    const targetBucket = routeBucket ?? position.bucket

    if (activeBucket.value !== targetBucket) {
      activeBucket.value = targetBucket
      await nextTick()
    }

    if (targetBucket === 'variable') {
      const index = variablePositions.value.findIndex(item => item.id === positionId)
      if (index >= 0) {
        setVariablePage(Math.floor(index / variablePageSize.value) + 1)
      }
    } else {
      const index = fixedPositions.value.findIndex(item => item.id === positionId)
      if (index >= 0) {
        setFixedPage(Math.floor(index / fixedPageSize.value) + 1)
      }
    }

    openViewPosition(position)

    const nextQuery = { ...route.query }
    delete nextQuery.positionId
    delete nextQuery.bucket

    await router.replace({ query: nextQuery }).catch((error) => {
      console.error('Erro ao limpar query de busca global em investimentos:', error)
    })
  }

  // ── Submit handlers ──

  async function loadPageData() {
    beginAttempt()

    try {
      const results = await Promise.allSettled(sourceLoaders.map(item => item.load()))
      const failed = new Set<string>()
      const succeeded: string[] = []
      let totalSourcesForAttempt = sourceLoaders.length

      for (const [index, result] of results.entries()) {
        if (result.status === 'fulfilled') {
          const source = sourceLoaders[index]
          if (source) succeeded.push(source.label)
          continue
        }

        const source = sourceLoaders[index]
        if (!source) continue
        failed.add(source.label)
        console.error(`Erro ao carregar ${source.label}:`, result.reason)
      }

      const positionsLoaded = results[1]?.status === 'fulfilled'
      const eventsLoaded = results[2]?.status === 'fulfilled'
      if (positionsLoaded && eventsLoaded) {
        totalSourcesForAttempt += 1
        try {
          const recomputeResult = await eventsStore.recomputeAllPositions()
          if (recomputeResult.failed > 0) {
            failed.add('recalculo de investimentos')
            console.error(
              `Falha ao recalcular ${recomputeResult.failed} de ${recomputeResult.total} posicoes`,
            )
          } else {
            succeeded.push('recalculo de investimentos')
          }
        } catch (error) {
          failed.add('recalculo de investimentos')
          console.error('Erro ao recalcular posicoes:', error)
        }
      }

      completeAttempt({
        failedSources: [...failed],
        succeededSources: succeeded.filter(label => !failed.has(label)),
        totalSources: totalSourcesForAttempt,
      })
    } catch (error) {
      completeAttempt({
        failedSources: sourceLoaders.map(source => source.label),
        succeededSources: [],
        totalSources: sourceLoaders.length,
      })
      console.error('Erro inesperado ao carregar investimentos:', error)
    }
  }

  async function submitPosition() {
    if (isProcessing.value) return
    savingPosition.value = true
    try {
      if (!positionForm.accountId) throw new Error('Selecione uma conta')
      if (requiresAssetCode.value && !positionForm.asset_code.trim()) {
        throw new Error('Informe o código')
      }

      const normalizedCode = requiresAssetCode.value
        ? positionForm.asset_code.trim().toUpperCase()
        : 'CAIXINHA'

      if (editingPosition.value && editingPositionHasEvents.value) {
        if (editingPosition.value.accountId !== positionForm.accountId) {
          throw new Error('Não é possível alterar a conta de um ativo com lançamentos')
        }
        if (editingPosition.value.bucket !== positionForm.bucket) {
          throw new Error('Não é possível alterar o grupo de um ativo com lançamentos')
        }
      }

      if (positionForm.bucket === 'variable') {
        const duplicate = positionsStore.positions.find(p =>
          p.id !== editingPosition.value?.id
          && p.accountId === positionForm.accountId
          && p.bucket === 'variable'
          && p.investment_type === positionForm.investment_type
          && p.asset_code.toUpperCase() === normalizedCode,
        )
        if (duplicate) throw new Error('Ja existe esse ativo cadastrado para essa conta')
      }

      const payload = {
        accountId: positionForm.accountId,
        bucket: positionForm.bucket,
        investment_type: positionForm.investment_type,
        asset_code: normalizedCode,
        name: positionForm.bucket === 'fixed' ? (positionForm.name.trim() || undefined) : undefined,
        metadata: positionForm.bucket === 'fixed'
          ? {
              issuer: positionForm.issuer || undefined,
              indexer: positionForm.indexer || undefined,
              rate_mode: positionForm.rate_percent ? positionForm.rate_mode : undefined,
              rate_percent: positionForm.rate_percent ? Number(positionForm.rate_percent.replace(',', '.')) : undefined,
              maturity_date: positionForm.maturity_date || undefined,
              liquidity: positionForm.liquidity || undefined,
            }
          : undefined,
      }

      if (editingPosition.value) {
        await positionsStore.updatePosition(editingPosition.value.id, payload)
        appToast.success({ title: 'Ativo atualizado' })
      } else {
        await positionsStore.addPosition({
          ...payload,
          is_active: true,
          invested_cents: 0,
        })
        appToast.success({ title: 'Ativo criado' })
      }

      resetPositionForm()
      positionDialogOpen.value = false
    } catch (e: unknown) {
      appToast.error({
        title: editingPosition.value ? 'Erro ao atualizar ativo' : 'Erro ao criar ativo',
        description: getErrorMessage(e, 'Nao foi possivel salvar o ativo.'),
      })
    } finally {
      savingPosition.value = false
    }
  }

  async function submitEvent() {
    if (isProcessing.value) return
    savingEvent.value = true
    try {
      if (!eventForm.positionId) throw new Error('Selecione um ativo')
      if (!eventForm.date) throw new Error('Informe a data')
      if (!eventForm.amount) throw new Error('Informe o valor total')
      const amountCents = parseBRLToCents(eventForm.amount)
      if (amountCents <= 0) throw new Error('Valor do evento deve ser maior que zero')

      const position = selectedPosition.value
      if (!position) throw new Error('Ativo inválido')

      if (position.investment_type === 'caixinha' && eventForm.event_type === 'maturity') {
        throw new Error('Evento vencimento não está disponível para caixinha')
      }

      if (position.bucket === 'variable' && (eventForm.event_type === 'buy' || eventForm.event_type === 'sell')) {
        const qty = Number(eventForm.quantity.replace(',', '.'))
        if (!Number.isFinite(qty) || qty <= 0) throw new Error('Informe a quantidade')
        if (eventForm.event_type === 'sell') {
          const availableQty = getEffectiveAvailableQuantityForSell(position, editingEvent.value)
          if (qty > availableQty) {
            throw new Error(`Voce possui apenas ${formatQuantityDisplay(availableQty)} cotas`)
          }
        }
      }

      const payload = {
        positionId: position.id,
        accountId: position.accountId,
        date: eventForm.date,
        event_type: eventForm.event_type,
        amount_cents: amountCents,
        quantity: eventForm.quantity ? Number(eventForm.quantity.replace(',', '.')) : undefined,
        unit_price_cents: eventForm.unit_price ? parseBRLToCents(eventForm.unit_price) : undefined,
        note: eventForm.note || undefined,
      }

      if (editingEvent.value) {
        await eventsStore.updateEvent(editingEvent.value.id, payload)
        appToast.success({ title: 'Lancamento atualizado' })
      } else {
        await eventsStore.addEvent(payload)
        appToast.success({ title: 'Lancamento registrado' })
      }

      resetEventForm()
      eventDialogOpen.value = false
    } catch (e: unknown) {
      appToast.error({
        title: editingEvent.value ? 'Erro ao atualizar lancamento' : 'Erro ao registrar lancamento',
        description: getErrorMessage(e, 'Nao foi possivel salvar o lancamento.'),
      })
    } finally {
      savingEvent.value = false
    }
  }

  onMounted(async () => {
    await loadPageData()
  })

  onBeforeRouteLeave(() => {
    if (!showDeletePositionProgressModal.value) return true

    appToast.warning({
      title: 'Operacao em andamento',
      description: 'Aguarde a conclusao. A navegacao e os cliques estao temporariamente bloqueados.',
    })
    return false
  })

  return {
    // Stores (for template direct use)
    accountsStore, positionsStore,
    // State
    activeBucket,
    loading, refreshing,
    hasPartialLoadError, hasFatalLoadError,
    loadErrorMessage, staleDataMessage,
    isProcessing,
    // Dialogs
    positionDialogOpen, eventDialogOpen,
    positionViewDialogOpen, eventViewDialogOpen,
    editingPosition, editingEvent,
    viewingPosition, viewingEvent,
    confirmDeleteOpen, deleteTarget, deleting,
    savingPosition, savingEvent,
    showDeletePositionProgressModal,
    deletePositionProgressStep, deletePositionProgressLabel,
    deletePositionProgressPercent, deletePositionProgressMeta,
    // Forms
    positionForm, eventForm,
    // Options
    investmentTypeOptions, filteredTypes, pageSizeOptions, eventTypeOptions,
    // Computed
    requiresAssetCode,
    positionDialogTitle, eventDialogTitle,
    editingPositionHasEvents,
    variablePositions, fixedPositions,
    selectedPosition, availableSellQuantity,
    filteredEvents,
    // Pagination — variable
    variablePageSize, variablePage, variableGoToPage,
    variableTotalItems, variableTotalPages,
    variablePageStart, variablePageEnd,
    paginatedVariablePositions, submitVariableGoToPage,
    setVariablePage,
    // Pagination — fixed
    fixedPageSize, fixedPage, fixedGoToPage,
    fixedTotalItems, fixedTotalPages,
    fixedPageStart, fixedPageEnd,
    paginatedFixedPositions, submitFixedGoToPage,
    setFixedPage,
    // Pagination — events
    eventsPageSize, eventsPage, eventsGoToPage,
    eventsTotalItems, eventsTotalPages,
    eventsPageStart, eventsPageEnd,
    paginatedEvents, submitEventsGoToPage,
    setEventsPage,
    // Viewing
    viewingPositionEvents, viewingPositionTimeline,
    viewingCaixinhaSummary, viewingVariableSummary,
    showDetailedEvolution, viewingTimelineTitle,
    timelineChartData, timelineStartDate, timelineEndDate,
    // Helpers
    getAccountLabel, getPositionLabel, getPositionDisplay,
    getInvestmentTypeLabel, getEventTypeLabel,
    isOutflowEventType, getEventValueColorClass,
    formatCentsToInput, formatQuantityDisplay,
    positionHasEvents, getPositionEventsCount,
    getEventSignedValueCents,
    // Actions
    loadPageData,
    openNewPosition, openEditPosition, openViewPosition,
    openNewEvent, openEditEvent, openViewEvent,
    requestDeletePosition, requestDeleteEvent,
    cancelDelete, confirmDelete,
    onPositionDialogOpenChange, onEventDialogOpenChange,
    submitPosition, submitEvent,
  }
}


