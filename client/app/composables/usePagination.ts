import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

type ItemsSource<T> = Ref<T[]> | ComputedRef<T[]>

export function usePagination<T>(items: ItemsSource<T>, initialPageSize = 40) {
  const pageSize = ref<number>(initialPageSize)
  const page = ref(1)
  const goToPage = ref('')

  const totalItems = computed(() => items.value.length)
  const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)))
  const pageStart = computed(() => (totalItems.value ? (page.value - 1) * pageSize.value + 1 : 0))
  const pageEnd = computed(() => Math.min(page.value * pageSize.value, totalItems.value))
  const paginatedItems = computed(() => {
    const start = (page.value - 1) * pageSize.value
    return items.value.slice(start, start + pageSize.value)
  })

  function clampPage(value: number) {
    return Math.min(Math.max(1, value), totalPages.value)
  }

  function setPage(value: number) {
    page.value = clampPage(value)
  }

  function submitGoToPage() {
    const parsed = Number(goToPage.value)
    if (Number.isFinite(parsed) && parsed >= 1) {
      setPage(Math.trunc(parsed))
    }
    goToPage.value = ''
  }

  function resetPage() {
    page.value = 1
    goToPage.value = ''
  }

  watch([pageSize, totalPages], () => {
    setPage(page.value)
  })

  return {
    pageSize,
    page,
    goToPage,
    totalItems,
    totalPages,
    pageStart,
    pageEnd,
    paginatedItems,
    setPage,
    submitGoToPage,
    resetPage,
  }
}

