const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const dbHandler = require('./db-handler')

function getRuntimeConfig() {
  const isPackaged = app.isPackaged
  const isDev = !isPackaged
  const devServerUrl = process.env.NUXT_DEV_SERVER_URL?.trim() || 'http://localhost:3010'
  const openDevTools = isDev && process.env.ELECTRON_OPEN_DEVTOOLS === '1'

  return {
    isPackaged,
    isDev,
    devServerUrl,
    openDevTools,
  }
}

function resolveProdIndexPath(isPackaged) {
  const publicDir = isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(__dirname, '..', 'client', '.output', 'public')

  return path.join(publicDir, 'index.html')
}

async function ensureDevServerAvailable(devServerUrl) {
  const timeoutMs = 4000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    await fetch(devServerUrl, { method: 'HEAD', signal: controller.signal })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Servidor de desenvolvimento indisponivel em ${devServerUrl}: ${detail}`)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function createWindow(runtime) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: 'default',
    autoHideMenuBar: true,
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(
      `[electron] Falha ao carregar janela (${errorCode}) ${errorDescription}. URL: ${validatedURL || 'N/A'}`,
    )
  })

  if (runtime.isDev) {
    await ensureDevServerAvailable(runtime.devServerUrl)
    await win.loadURL(runtime.devServerUrl)
    if (runtime.openDevTools) {
      win.webContents.openDevTools()
    }
  } else {
    await win.loadFile(resolveProdIndexPath(runtime.isPackaged))
  }

  return win
}

// Inicializa o db-handler antes de criar a janela
app.whenReady().then(async () => {
  const runtime = getRuntimeConfig()
  dbHandler.init(app.getPath('userData'), runtime.isDev, runtime.isPackaged ? process.resourcesPath : null)

  // Registra handlers IPC
  ipcMain.handle('db:get', (_event, urlPath, params) => {
    return dbHandler.handleGet(urlPath, params)
  })

  ipcMain.handle('db:post', (_event, urlPath, body) => {
    return dbHandler.handlePost(urlPath, body)
  })

  ipcMain.handle('db:patch', (_event, urlPath, body) => {
    return dbHandler.handlePatch(urlPath, body)
  })

  ipcMain.handle('db:delete', (_event, urlPath) => {
    return dbHandler.handleDelete(urlPath)
  })

  ipcMain.handle('db:atomic', (_event, action, payload) => {
    return dbHandler.handleAtomic(action, payload)
  })

  try {
    await createWindow(runtime)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error(`[electron] Erro ao inicializar a janela principal: ${detail}`)
    app.quit()
    return
  }

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length !== 0) return

    try {
      await createWindow(runtime)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`[electron] Erro ao recriar a janela principal: ${detail}`)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
