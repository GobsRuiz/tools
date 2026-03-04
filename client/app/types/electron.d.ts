export interface ElectronAPI {
  get: <T = any>(path: string, params?: Record<string, string>) => Promise<T>
  post: <T = any>(path: string, body: unknown) => Promise<T>
  patch: <T = any>(path: string, body: unknown) => Promise<T>
  del: <T = any>(path: string) => Promise<T>
  atomic: <T = any>(action: string, payload?: unknown) => Promise<T>
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}
