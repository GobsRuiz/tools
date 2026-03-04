<script setup lang="ts">
import { onClickOutside, useEventListener } from '@vueuse/core'
import type { Component } from 'vue'
import { ArrowLeftRight, CandlestickChart, Loader2, Repeat, Search } from 'lucide-vue-next'
import type { GlobalSearchResult, GlobalSearchResultKind } from '~/composables/useGlobalSearch'
import { useGlobalSearch } from '~/composables/useGlobalSearch'

type IndexedResult = GlobalSearchResult & { flatIndex: number }

const {
  query,
  loading,
  loadError,
  ensureLoaded,
  groupedResults,
  results,
  clearQuery,
} = useGlobalSearch()

const containerRef = ref<HTMLElement | null>(null)
const open = ref(false)
const highlightedIndex = ref(-1)

const shortcutLabel = computed(() => {
  if (typeof navigator === 'undefined') return 'Ctrl+K'
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform) ? 'Cmd+K' : 'Ctrl+K'
})

const hasQuery = computed(() => query.value.trim().length > 0)

const displayGroups = computed(() => {
  let index = 0
  const groups = [
    { key: 'transactions', label: 'Transações', items: groupedResults.value.transactions },
    { key: 'recurrents', label: 'Recorrentes', items: groupedResults.value.recurrents },
    { key: 'investments', label: 'Investimentos', items: groupedResults.value.investments },
  ]

  return groups
    .map(group => ({
      ...group,
      items: group.items.map(item => ({ ...item, flatIndex: index++ } as IndexedResult)),
    }))
    .filter(group => group.items.length > 0)
})

const flatResults = computed<IndexedResult[]>(() =>
  displayGroups.value.flatMap(group => group.items),
)

const resultIconByKind: Record<GlobalSearchResultKind, Component> = {
  transaction: ArrowLeftRight,
  recurrent: Repeat,
  investment: CandlestickChart,
}

function resolveInputElement() {
  if (!containerRef.value) return null
  return containerRef.value.querySelector('input')
}

async function focusSearchInput(selectContent = true) {
  open.value = true
  await ensureLoaded()
  await nextTick()
  const input = resolveInputElement()
  input?.focus()
  if (selectContent) input?.select()
}

async function handleInputFocus() {
  open.value = true
  await ensureLoaded()
}

function closeDropdown() {
  open.value = false
  highlightedIndex.value = -1
}

async function selectResult(result: GlobalSearchResult) {
  closeDropdown()
  clearQuery()
  await navigateTo(result.route)
}

function moveHighlight(step: number) {
  const total = flatResults.value.length
  if (total === 0) return

  if (highlightedIndex.value < 0) {
    highlightedIndex.value = step > 0 ? 0 : total - 1
    return
  }

  highlightedIndex.value = (highlightedIndex.value + step + total) % total
}

function handleInputKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveHighlight(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveHighlight(-1)
    return
  }

  if (event.key === 'Enter') {
    const target = flatResults.value[highlightedIndex.value] ?? flatResults.value[0]
    if (!target) return
    event.preventDefault()
    void selectResult(target)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
  }
}

watch(query, async (value) => {
  if (!value.trim()) {
    highlightedIndex.value = -1
    return
  }

  if (!open.value) {
    open.value = true
  }

  await ensureLoaded()
})

watch(flatResults, (items) => {
  if (!hasQuery.value) {
    highlightedIndex.value = -1
    return
  }

  if (items.length === 0) {
    highlightedIndex.value = -1
    return
  }

  if (highlightedIndex.value < 0 || highlightedIndex.value >= items.length) {
    highlightedIndex.value = 0
  }
})

onClickOutside(containerRef, () => {
  closeDropdown()
})

if (import.meta.client) {
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey)) return
    if (event.key.toLowerCase() !== 'k') return

    event.preventDefault()
    void focusSearchInput()
  })
}
</script>

<template>
  <div ref="containerRef" class="relative w-full max-w-xl">
    <div class="relative">
      <Search class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        v-model="query"
        placeholder="Buscar transações, recorrentes e investimentos..."
        class="h-9 pl-9 pr-20"
        @focus="handleInputFocus"
        @keydown="handleInputKeydown"
      />
      <kbd class="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
        {{ shortcutLabel }}
      </kbd>
    </div>

    <div
      v-if="open"
      class="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 rounded-md border bg-popover shadow-md"
    >
      <div v-if="loading" class="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
        <Loader2 class="h-4 w-4 animate-spin" />
        Carregando dados da busca...
      </div>

      <template v-else>
        <p
          v-if="loadError"
          class="border-b border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-500"
        >
          Resultados podem estar incompletos. {{ loadError }} A busca tenta recarregar automaticamente ao abrir novamente.
        </p>

        <p
          v-if="!hasQuery"
          class="px-3 py-3 text-sm text-muted-foreground"
        >
          Digite para buscar por descrição, nome ou código do ativo.
        </p>

        <p
          v-else-if="!results.length"
          class="px-3 py-3 text-sm text-muted-foreground"
        >
          Nenhum resultado encontrado.
        </p>

        <div v-else class="max-h-80 overflow-y-auto py-1">
          <div v-for="group in displayGroups" :key="group.key" class="px-1 pb-1">
            <p class="px-2 py-1 text-xs font-medium text-muted-foreground">
              {{ group.label }}
            </p>
            <button
              v-for="item in group.items"
              :key="`${item.kind}:${item.id}`"
              type="button"
              class="flex w-full items-start gap-2 rounded-sm px-2 py-2 text-left transition-colors"
              :class="item.flatIndex === highlightedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'"
              @mouseenter="highlightedIndex = item.flatIndex"
              @mousedown.prevent
              @click="selectResult(item)"
            >
              <component :is="resultIconByKind[item.kind]" class="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ item.title }}
                </p>
                <p class="truncate text-xs text-muted-foreground">
                  {{ item.subtitle }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
