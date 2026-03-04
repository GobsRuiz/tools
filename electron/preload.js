const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * GET /collection ou /collection/id
   * @param {string} path - ex: "/accounts", "/transactions/tx-001"
   * @param {Record<string, string>} [params] - query params opcionais
   */
  get: (path, params) => ipcRenderer.invoke('db:get', path, params),

  /**
   * POST /collection
   * @param {string} path - ex: "/accounts"
   * @param {object} body - dados do item
   */
  post: (path, body) => ipcRenderer.invoke('db:post', path, body),

  /**
   * PATCH /collection/id
   * @param {string} path - ex: "/accounts/1"
   * @param {object} body - campos a atualizar
   */
  patch: (path, body) => ipcRenderer.invoke('db:patch', path, body),

  /**
   * DELETE /collection/id
   * @param {string} path - ex: "/transactions/tx-001"
   */
  del: (path) => ipcRenderer.invoke('db:delete', path),

  /**
   * Atomic operation on db-handler (all-or-nothing in Electron process).
   * @param {string} action
   * @param {unknown} payload
   */
  atomic: (action, payload) => ipcRenderer.invoke('db:atomic', action, payload),
})
