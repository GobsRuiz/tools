export interface ElectronAPI {
  get: <T = unknown>(path: string, params?: Record<string, string>) => Promise<T>
  post: <T = unknown>(path: string, body: unknown) => Promise<T>
  patch: <T = unknown>(path: string, body: unknown) => Promise<T>
  del: <T = unknown>(path: string) => Promise<T>
  atomic: <T = unknown>(action: string, payload?: unknown) => Promise<T>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
