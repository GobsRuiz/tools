import type {} from '~/types/electron'

const DEFAULT_BASE_URL = 'http://localhost:3011'

type ApiErrorCode = 'NOT_FOUND' | 'API_ERROR'

interface IpcErrorPayload {
  __ipcError: {
    status: number
    code: string
    message: string
  }
}

export class ApiClientError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.code = code
  }
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI
}

function inferErrorCode(status: number): ApiErrorCode {
  if (status === 404) return 'NOT_FOUND'
  return 'API_ERROR'
}

function toApiError(status: number, message?: string): ApiClientError {
  return new ApiClientError(message || `API error (${status})`, status, inferErrorCode(status))
}

function isIpcErrorPayload(value: unknown): value is IpcErrorPayload {
  if (!value || typeof value !== 'object') return false
  if (!('__ipcError' in value)) return false

  const payload = (value as IpcErrorPayload).__ipcError
  return (
    !!payload
    && typeof payload === 'object'
    && typeof payload.status === 'number'
    && typeof payload.code === 'string'
    && typeof payload.message === 'string'
  )
}

function resolveBaseUrl(): string {
  let runtimeApiBase = ''

  try {
    runtimeApiBase = useRuntimeConfig().public.apiBase || ''
  } catch {
    runtimeApiBase = ''
  }

  const envApiBase = typeof process !== 'undefined'
    ? process.env.NUXT_PUBLIC_API_BASE ?? ''
    : ''

  const baseUrl = runtimeApiBase || envApiBase || DEFAULT_BASE_URL
  return baseUrl.replace(/\/+$/, '')
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = await res.json() as { message?: string; error?: string }
      return data.message || data.error || `API error: ${res.status} ${res.statusText}`
    }
    const text = await res.text()
    return text || `API error: ${res.status} ${res.statusText}`
  } catch {
    return `API error: ${res.status} ${res.statusText}`
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  if (!res.ok) {
    const message = await parseErrorMessage(res)
    throw toApiError(res.status, message)
  }

  return res.json()
}

function normalizeElectronResponse<T>(response: T | IpcErrorPayload): T {
  if (isIpcErrorPayload(response)) {
    const payload = response.__ipcError
    throw new ApiClientError(payload.message, payload.status, payload.code || inferErrorCode(payload.status))
  }
  return response
}

export function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (isElectron()) {
    return window.electronAPI!.get(path, params)
  }
  const query = params ? '?' + new URLSearchParams(params).toString() : ''
  return request<T>(`${path}${query}`)
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  if (isElectron()) {
    return window.electronAPI!.post(path, body)
  }
  return request<T>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  if (isElectron()) {
    return window.electronAPI!.patch<T | IpcErrorPayload>(path, body).then(normalizeElectronResponse)
  }
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function apiDelete<T = void>(path: string): Promise<T> {
  if (isElectron()) {
    return window.electronAPI!.del<T | IpcErrorPayload>(path).then(normalizeElectronResponse)
  }
  return request<T>(path, { method: 'DELETE' })
}

export function apiAtomic<T>(action: string, payload?: unknown): Promise<T> {
  if (!isElectron() || !window.electronAPI?.atomic) {
    throw new ApiClientError('Operacao atomica indisponivel neste ambiente.', 501, 'API_ERROR')
  }
  return window.electronAPI.atomic<T | IpcErrorPayload>(action, payload).then(normalizeElectronResponse)
}
