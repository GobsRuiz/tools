import { afterEach, describe, expect, it, vi } from 'vitest'

// setup.ts mocks ~/utils/api globally; unmock here to test real implementation
vi.unmock('~/utils/api')

import { ApiClientError, apiDelete, apiPatch } from '../../app/utils/api'

describe('API error contract parity (web/electron)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    delete (window as Window & { electronAPI?: unknown }).electronAPI
  })

  it('throws standardized NOT_FOUND on Web PATCH 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: 'Not Found' }), {
          status: 404,
          statusText: 'Not Found',
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )

    await expect(apiPatch('/transactions/missing-id', { paid: true })).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Not Found',
    } satisfies Partial<ApiClientError>)
  })

  it('throws standardized NOT_FOUND on Electron DELETE when IPC reports missing record', async () => {
    ;(window as Window & {
      electronAPI: { del: (path: string) => Promise<unknown> }
    }).electronAPI = {
      del: vi.fn().mockResolvedValue({
        __ipcError: {
          status: 404,
          code: 'NOT_FOUND',
          message: 'Resource not found: /transactions/missing-id',
        },
      }),
    }

    await expect(apiDelete('/transactions/missing-id')).rejects.toMatchObject({
      name: 'ApiClientError',
      status: 404,
      code: 'NOT_FOUND',
      message: 'Resource not found: /transactions/missing-id',
    } satisfies Partial<ApiClientError>)
  })

  it('returns payload normally on Electron PATCH success', async () => {
    const patchResponse = { id: 'tx-1', paid: true }
    ;(window as Window & {
      electronAPI: { patch: (path: string, body: unknown) => Promise<unknown> }
    }).electronAPI = {
      patch: vi.fn().mockResolvedValue(patchResponse),
    }

    await expect(apiPatch('/transactions/tx-1', { paid: true })).resolves.toEqual(patchResponse)
  })
})
