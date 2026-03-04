import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePageLoadState } from '~/composables/usePageLoadState'

describe('usePageLoadState', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marca sucesso inicial sem erro parcial/fatal', async () => {
    const state = usePageLoadState()
    const loaders = [
      { label: 'contas', load: vi.fn().mockResolvedValue(undefined) },
      { label: 'movimentacoes', load: vi.fn().mockResolvedValue(undefined) },
    ]

    await state.runLoad(loaders)

    expect(state.hasCurrentAttemptFatal.value).toBe(false)
    expect(state.hasPartialLoadError.value).toBe(false)
    expect(state.lastSuccessfulAt.value).toBeTruthy()
    expect(state.loadErrorMessage.value).toBe('')
  })

  it('marca erro parcial quando apenas parte dos loaders falha', async () => {
    const state = usePageLoadState()
    const loaders = [
      { label: 'contas', load: vi.fn().mockResolvedValue(undefined) },
      { label: 'movimentacoes', load: vi.fn().mockRejectedValue(new Error('api down')) },
    ]

    await state.runLoad(loaders)

    expect(state.hasCurrentAttemptFatal.value).toBe(false)
    expect(state.hasPartialLoadError.value).toBe(true)
    expect(state.loadErrorMessage.value).toContain('movimentacoes')
  })

  it('marca erro fatal na tentativa atual mesmo apos sucesso anterior e expõe aviso de stale data', async () => {
    const state = usePageLoadState()
    const loadersSuccess = [
      { label: 'contas', load: vi.fn().mockResolvedValue(undefined) },
      { label: 'movimentacoes', load: vi.fn().mockResolvedValue(undefined) },
    ]

    await state.runLoad(loadersSuccess)
    expect(state.lastSuccessfulAt.value).toBeTruthy()

    const loadersFail = [
      { label: 'contas', load: vi.fn().mockRejectedValue(new Error('api down')) },
      { label: 'movimentacoes', load: vi.fn().mockRejectedValue(new Error('api down')) },
    ]

    await state.runLoad(loadersFail)

    expect(state.hasCurrentAttemptFatal.value).toBe(true)
    expect(state.hasPartialLoadError.value).toBe(false)
    expect(state.staleDataMessage.value).toContain('Dados exibidos podem estar desatualizados')
  })
})
