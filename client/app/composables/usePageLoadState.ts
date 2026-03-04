type PageLoader = {
  label: string
  load: () => Promise<unknown>
}

type CompleteAttemptInput = {
  failedSources: string[]
  succeededSources: string[]
  totalSources: number
}

export function usePageLoadState() {
  const loading = ref(true)
  const refreshing = ref(false)
  const lastAttemptFailedSources = ref<string[]>([])
  const lastAttemptSucceededSources = ref<string[]>([])
  const lastAttemptTotalSources = ref(0)
  const hasCompletedAttempt = ref(false)
  const lastSuccessfulAt = ref<string | null>(null)

  function beginAttempt() {
    if (!hasCompletedAttempt.value) {
      loading.value = true
      refreshing.value = false
      return
    }

    refreshing.value = true
  }

  function completeAttempt(input: CompleteAttemptInput) {
    lastAttemptFailedSources.value = [...input.failedSources]
    lastAttemptSucceededSources.value = [...input.succeededSources]
    lastAttemptTotalSources.value = input.totalSources

    if (input.succeededSources.length > 0) {
      lastSuccessfulAt.value = new Date().toISOString()
    }

    hasCompletedAttempt.value = true
    loading.value = false
    refreshing.value = false
  }

  async function runLoad(loaders: PageLoader[]) {
    beginAttempt()

    try {
      const results = await Promise.allSettled(loaders.map(item => item.load()))
      const failed: string[] = []
      const succeeded: string[] = []

      for (const [index, result] of results.entries()) {
        const source = loaders[index]
        if (!source) continue

        if (result.status === 'fulfilled') {
          succeeded.push(source.label)
          continue
        }

        failed.push(source.label)
        console.error(`Erro ao carregar ${source.label}:`, result.reason)
      }

      completeAttempt({
        failedSources: failed,
        succeededSources: succeeded,
        totalSources: loaders.length,
      })
    } catch (error) {
      const allLabels = loaders.map(item => item.label)
      completeAttempt({
        failedSources: allLabels,
        succeededSources: [],
        totalSources: loaders.length,
      })
      console.error('Erro inesperado ao executar carregamento da pagina:', error)
    }
  }

  const hasCurrentAttemptFatal = computed(() =>
    hasCompletedAttempt.value
    && lastAttemptTotalSources.value > 0
    && lastAttemptFailedSources.value.length === lastAttemptTotalSources.value,
  )

  const hasPartialLoadError = computed(() =>
    hasCompletedAttempt.value
    && lastAttemptFailedSources.value.length > 0
    && !hasCurrentAttemptFatal.value,
  )

  const loadErrorMessage = computed(() => {
    if (!lastAttemptFailedSources.value.length) return ''
    return `Falha ao carregar: ${lastAttemptFailedSources.value.join(', ')}.`
  })

  const staleDataMessage = computed(() => {
    if (!hasCurrentAttemptFatal.value || !lastSuccessfulAt.value) return ''

    const formatted = new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(lastSuccessfulAt.value))

    return `Dados exibidos podem estar desatualizados. Última carga válida em ${formatted}.`
  })

  return {
    loading,
    refreshing,
    lastAttemptFailedSources,
    lastAttemptSucceededSources,
    lastAttemptTotalSources,
    lastSuccessfulAt,
    beginAttempt,
    completeAttempt,
    runLoad,
    hasCurrentAttemptFatal,
    hasPartialLoadError,
    loadErrorMessage,
    staleDataMessage,
  }
}
