import { computed, nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { usePagination } from '~/composables/usePagination'

describe('usePagination', () => {
  it('pagina corretamente e respeita clamp de pagina', () => {
    const items = ref([1, 2, 3, 4, 5, 6, 7])
    const pagination = usePagination(items, 3)

    expect(pagination.totalItems.value).toBe(7)
    expect(pagination.totalPages.value).toBe(3)
    expect(pagination.paginatedItems.value).toEqual([1, 2, 3])

    pagination.setPage(2)
    expect(pagination.paginatedItems.value).toEqual([4, 5, 6])
    expect(pagination.pageStart.value).toBe(4)
    expect(pagination.pageEnd.value).toBe(6)

    pagination.setPage(99)
    expect(pagination.page.value).toBe(3)
    expect(pagination.paginatedItems.value).toEqual([7])
  })

  it('submitGoToPage ignora invalido, aplica valido e limpa input', () => {
    const items = ref([1, 2, 3, 4, 5])
    const pagination = usePagination(items, 2)

    pagination.goToPage.value = 'abc'
    pagination.submitGoToPage()
    expect(pagination.page.value).toBe(1)
    expect(pagination.goToPage.value).toBe('')

    pagination.goToPage.value = '3'
    pagination.submitGoToPage()
    expect(pagination.page.value).toBe(3)
    expect(pagination.paginatedItems.value).toEqual([5])
    expect(pagination.goToPage.value).toBe('')
  })

  it('reajusta pagina automaticamente quando pageSize ou total mudam', async () => {
    const items = ref([1, 2, 3, 4, 5, 6])
    const pagination = usePagination(items, 2)

    pagination.setPage(3)
    expect(pagination.page.value).toBe(3)
    expect(pagination.paginatedItems.value).toEqual([5, 6])

    pagination.pageSize.value = 4
    await nextTick()
    expect(pagination.totalPages.value).toBe(2)
    expect(pagination.page.value).toBe(2)
    expect(pagination.paginatedItems.value).toEqual([5, 6])

    items.value = [1]
    await nextTick()
    expect(pagination.totalPages.value).toBe(1)
    expect(pagination.page.value).toBe(1)
    expect(pagination.paginatedItems.value).toEqual([1])
  })

  it('funciona com fonte computed e resetPage volta estado inicial de navegacao', () => {
    const base = ref([1, 2, 3, 4, 5, 6])
    const evenItems = computed(() => base.value.filter(item => item % 2 === 0))
    const pagination = usePagination(evenItems, 2)

    pagination.setPage(2)
    pagination.goToPage.value = '2'
    expect(pagination.paginatedItems.value).toEqual([6])

    pagination.resetPage()
    expect(pagination.page.value).toBe(1)
    expect(pagination.goToPage.value).toBe('')
    expect(pagination.paginatedItems.value).toEqual([2, 4])
  })
})
