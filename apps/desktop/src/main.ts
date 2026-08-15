/** Electron application shell for the existing DeepSeek Harness Web surface. */

import { app, BrowserWindow, dialog, shell } from 'electron'
import { harnessHome, startHarnessProcess, type HarnessProcess } from './backend.ts'
import { isAppNavigation, isSafeExternalUrl } from './security.ts'

const APP_NAME = 'DeepSeek Harness'
const STARTING_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${APP_NAME}</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { align-items: center; background: #111827; color: #f9fafb; display: flex; height: 100vh; justify-content: center; margin: 0; }
    main { text-align: center; }
    .mark { animation: pulse 1.4s ease-in-out infinite; background: #fff; border-radius: 50%; height: 44px; margin: 0 auto 24px; width: 44px; }
    h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
    p { color: #9ca3af; font-size: 14px; margin: 0; }
    @keyframes pulse { 50% { opacity: .35; transform: scale(.86); } }
  </style>
</head>
<body><main><div class="mark"></div><h1>${APP_NAME}</h1><p>Starting the local runtime…</p></main></body>
</html>`)}`

let mainWindow: BrowserWindow | undefined
let backend: HarnessProcess | undefined
let appOrigin: string | undefined
let quitting = false

/** Open an HTTPS target outside the privileged app window. */
function openExternal(target: string): void {
  if (!isSafeExternalUrl(target)) return
  void shell.openExternal(target)
}

/** Apply navigation, popup, permission, and renderer-process restrictions. */
function secureWindow(window: BrowserWindow): void {
  const guardNavigation = (event: Electron.Event, target: string): void => {
    if (isAppNavigation(target, appOrigin)) return
    event.preventDefault()
    openExternal(target)
  }
  window.webContents.on('will-navigate', guardNavigation)
  window.webContents.on('will-redirect', guardNavigation)
  window.webContents.on('will-attach-webview', (event) => { event.preventDefault() })
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => {
    callback(false)
  })
}

/** Create the one product window, initially showing local startup state. */
function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#111827',
    title: APP_NAME,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
    },
  })
  secureWindow(window)
  window.once('ready-to-show', () => { window.show() })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })
  void window.loadURL(appOrigin === undefined ? STARTING_PAGE : appOrigin)
  return window
}

/** Show a bounded startup/runtime failure and end the desktop process. */
async function failAndQuit(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error)
  const diagnostics = backend?.diagnostics()
  await dialog.showMessageBox({
    type: 'error',
    title: `${APP_NAME} could not start`,
    message,
    detail: diagnostics === undefined || diagnostics === '' ? undefined : diagnostics,
  })
  app.quit()
}

/** Start the managed backend and replace the startup page after readiness. */
async function start(): Promise<void> {
  const window = createWindow()
  mainWindow = window
  backend = startHarnessProcess({
    executable: process.execPath,
    cwd: app.getPath('home'),
    home: harnessHome(app.getPath('userData')),
    onUnexpectedExit: (message) => {
      if (quitting) return
      void failAndQuit(new Error(message))
    },
  })
  try {
    const url = await backend.ready
    appOrigin = new URL(url).origin
    if (!window.isDestroyed()) await window.loadURL(url)
  } catch (error) {
    await failAndQuit(error)
  }
}

app.setName(APP_NAME)
const singleInstance = app.requestSingleInstanceLock()
if (!singleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow === undefined) mainWindow = createWindow()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
  app.on('activate', () => {
    if (mainWindow === undefined) mainWindow = createWindow()
  })
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  app.on('before-quit', (event) => {
    if (quitting || backend === undefined) return
    event.preventDefault()
    quitting = true
    void backend.stop().finally(() => { app.quit() })
  })
  void app.whenReady().then(start)
}
