/** Electron application shell for the existing DeepSeek Harness Web surface. */

import { hostname } from 'node:os'
import { app, BrowserWindow, clipboard, dialog, Menu, shell } from 'electron'
import { LAN_ACCESS_USERNAME } from '@deepseek-ai/dsh-host-webserver'
import {
  harnessHome,
  startHarnessProcess,
  type HarnessProcess,
  type HarnessReady,
} from './backend.ts'
import {
  loadLanAccessPreference,
  saveLanAccessPreference,
  type LanAccessPreference,
} from './lan-access.ts'
import {
  loadRemoteAccessPreference,
  saveRemoteAccessPreference,
  type RemoteAccessPreference,
} from './remote-access.ts'
import { pollDeviceAuthorization, startDeviceAuthorization } from './remote-authorization.ts'
import {
  startRemoteTunnel,
  type RemoteTunnel,
  type RemoteTunnelState,
} from './remote-tunnel.ts'
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
let harnessReady: HarnessReady | undefined
let lanAccess: LanAccessPreference | undefined
let remoteAccess: RemoteAccessPreference | undefined
let remoteTunnel: RemoteTunnel | undefined
let remoteTunnelState: RemoteTunnelState = 'stopped'
let authorizationAbort: AbortController | undefined
let reconfiguring = false
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

/** Start one managed backend generation and load it into the product window. */
async function launchBackend(window: BrowserWindow): Promise<void> {
  const preference = lanAccess
  if (preference === undefined) throw new Error('Desktop LAN access preference was not loaded.')
  backend = startHarnessProcess({
    executable: process.execPath,
    cwd: app.getPath('home'),
    home: harnessHome(app.getPath('userData')),
    lanAccess: preference,
    onUnexpectedExit: (message) => {
      if (quitting) return
      void failAndQuit(new Error(message))
    },
  })
  harnessReady = await backend.ready
  appOrigin = new URL(harnessReady.localUrl).origin
  if (!window.isDestroyed()) await window.loadURL(harnessReady.localUrl)
  startRemoteAccessTunnel()
}

/** Stop the current backend generation and clear addresses derived from it. */
async function stopBackend(): Promise<void> {
  await stopRemoteAccessTunnel()
  const current = backend
  backend = undefined
  harnessReady = undefined
  appOrigin = undefined
  await current?.stop()
}

/** Start the reconnecting outbound tunnel when the user has explicitly enabled it. */
function startRemoteAccessTunnel(): void {
  const preference = remoteAccess
  const localUrl = harnessReady?.localUrl
  if (preference?.enabled !== true || preference.authorization === undefined || localUrl === undefined) return
  if (remoteTunnel !== undefined) return
  remoteTunnel = startRemoteTunnel({
    localUrl,
    authorization: preference.authorization,
    onStateChange: (state) => {
      remoteTunnelState = state
      if (state === 'stopped') remoteTunnel = undefined
      if (!quitting) installApplicationMenu()
    },
  })
}

/** Stop the current outbound tunnel and await all local proxy work. */
async function stopRemoteAccessTunnel(): Promise<void> {
  const current = remoteTunnel
  remoteTunnel = undefined
  remoteTunnelState = 'stopped'
  await current?.stop()
}

/** Show one desktop-owned message box, parented when the product window exists. */
function showMessageBox(options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  if (mainWindow === undefined || mainWindow.isDestroyed()) return dialog.showMessageBox(options)
  return dialog.showMessageBox(mainWindow, options)
}

/** Text copied for a LAN browser operator. */
function lanConnectionText(): string {
  const preference = lanAccess
  if (preference === undefined) throw new Error('Desktop LAN access preference was not loaded.')
  const address = harnessReady?.lanUrl ?? '未检测到可用的局域网 IPv4 地址'
  return [
    `访问地址：${address}`,
    `用户名：${LAN_ACCESS_USERNAME}`,
    `访问密钥：${preference.accessToken}`,
  ].join('\n')
}

/** Replace the managed server, rolling back the preference if the new bind fails. */
async function applyLanAccess(next: LanAccessPreference): Promise<boolean> {
  const previous = lanAccess
  const window = mainWindow
  if (previous === undefined || window === undefined || window.isDestroyed() || reconfiguring) return false
  reconfiguring = true
  installApplicationMenu()
  try {
    saveLanAccessPreference(app.getPath('userData'), next)
    lanAccess = next
    await window.loadURL(STARTING_PAGE)
    await stopBackend()
    await launchBackend(window)
    return true
  } catch (error) {
    const failedDiagnostics = backend?.diagnostics()
    await stopBackend()
    saveLanAccessPreference(app.getPath('userData'), previous)
    lanAccess = previous
    try {
      await launchBackend(window)
    } catch (recoveryError) {
      await failAndQuit(new AggregateError([error, recoveryError], 'LAN access change failed and the local server could not be restored.'))
      return false
    }
    const message = error instanceof Error ? error.message : String(error)
    await showMessageBox({
      type: 'error',
      title: '局域网访问设置失败',
      message: '未能应用局域网访问设置，已恢复原设置。',
      detail: failedDiagnostics === undefined || failedDiagnostics === ''
        ? message
        : `${message}\n\n${failedDiagnostics}`,
    })
    return false
  } finally {
    reconfiguring = false
    installApplicationMenu()
  }
}

/** Enable, inspect, copy, or disable authenticated LAN access. */
async function showLanAccessDialog(): Promise<void> {
  const preference = lanAccess
  if (preference === undefined || reconfiguring) return
  if (!preference.enabled) {
    const { response } = await showMessageBox({
      type: 'warning',
      title: '启用局域网访问',
      message: '允许同一局域网中的浏览器访问 DeepSeek Harness？',
      detail: '启用后程序会监听所有网络接口。局域网设备仍需输入独立访问密钥；连接使用普通 HTTP，请只在可信网络中使用。',
      buttons: ['启用并重启服务', '取消'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response !== 0) return
    if (await applyLanAccess({ ...preference, enabled: true })) await showLanAccessDialog()
    return
  }

  const { response } = await showMessageBox({
    type: 'info',
    title: '局域网访问',
    message: '局域网访问已启用',
    detail: `${lanConnectionText()}\n\n在浏览器登录页中输入上面的用户名和访问密钥。`,
    buttons: ['复制连接信息', '停用并重启服务', '关闭'],
    defaultId: 0,
    cancelId: 2,
  })
  if (response === 0) {
    clipboard.writeText(lanConnectionText())
    return
  }
  if (response === 1) await applyLanAccess({ ...preference, enabled: false })
}

/** Build one safe official-portal page URL. */
function portalPage(pathname: string): string {
  const preference = remoteAccess
  if (preference === undefined) throw new Error('Desktop remote access preference was not loaded.')
  return new URL(pathname, `${preference.portalUrl}/`).toString()
}

/** Open the system browser only after the shared HTTPS policy accepts the portal page. */
async function openPortalPage(pathname: string): Promise<void> {
  const target = portalPage(pathname)
  if (!isAllowedPortalTarget(target)) throw new Error('The configured portal is not a safe URL.')
  await shell.openExternal(target)
}

/** Accept HTTPS, plus exact-origin loopback HTTP already validated for development. */
function isAllowedPortalTarget(target: string): boolean {
  if (isSafeExternalUrl(target)) return true
  const preference = remoteAccess
  if (preference === undefined) return false
  try {
    const portal = new URL(preference.portalUrl)
    const candidate = new URL(target)
    return portal.protocol === 'http:' && candidate.origin === portal.origin
      && candidate.username === '' && candidate.password === ''
  } catch {
    return false
  }
}

/** Save a remote preference and synchronize the outbound tunnel without restarting Harness. */
async function applyRemoteAccess(next: RemoteAccessPreference): Promise<void> {
  saveRemoteAccessPreference(app.getPath('userData'), next)
  remoteAccess = next
  await stopRemoteAccessTunnel()
  startRemoteAccessTunnel()
  installApplicationMenu()
}

/** Complete portal login in the system browser and persist the returned device credential. */
async function authorizeRemoteDevice(): Promise<void> {
  const preference = remoteAccess
  if (preference === undefined || authorizationAbort !== undefined) return
  const controller = new AbortController()
  authorizationAbort = controller
  installApplicationMenu()
  try {
    const pending = await startDeviceAuthorization(preference.portalUrl, {
      name: hostname(),
      platform: process.platform,
      appVersion: app.getVersion(),
    }, controller.signal)
    if (!isAllowedPortalTarget(pending.verificationUrl)) {
      throw new Error('The portal returned an unsafe authorization URL.')
    }
    await shell.openExternal(pending.verificationUrl)
    const authorization = await pollDeviceAuthorization(preference.portalUrl, pending, controller.signal)
    const next: RemoteAccessPreference = { ...preference, authorization }
    await applyRemoteAccess(next)
    const { response } = await showMessageBox({
      type: 'info',
      title: '设备授权成功',
      message: `已登录账号：${authorization.accountName}`,
      detail: `设备授权码 ${pending.userCode} 已确认。远程控制仍然关闭，只有明确开启后服务器才能连接这台电脑。`,
      buttons: ['开启远程控制', '稍后'],
      defaultId: 0,
      cancelId: 1,
    })
    if (response === 0) await applyRemoteAccess({ ...next, enabled: true })
  } catch (error) {
    if (!controller.signal.aborted) {
      await showMessageBox({
        type: 'error',
        title: '远程访问授权失败',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    if (authorizationAbort === controller) authorizationAbort = undefined
    installApplicationMenu()
  }
}

/** Human-readable outbound tunnel state for the remote settings dialog. */
function remoteStateText(): string {
  if (remoteAccess?.enabled !== true) return '已关闭'
  switch (remoteTunnelState) {
    case 'connecting': return '正在连接中转服务器'
    case 'online': return '在线，可从设备中心连接'
    case 'offline': return '连接中断，正在自动重试'
    case 'stopped': return '等待本地服务启动'
  }
}

/** Authorize, enable, inspect, or disable account-based remote control. */
async function showRemoteAccessDialog(): Promise<void> {
  const preference = remoteAccess
  if (preference === undefined || authorizationAbort !== undefined) return
  if (preference.authorization === undefined) {
    const { response } = await showMessageBox({
      type: 'info',
      title: '远程访问',
      message: '登录官网并授权这台电脑',
      detail: '登录将在系统浏览器中完成，DeepSeek Harness Desktop 不会读取或保存你的官网密码。授权完成后，远程控制仍需单独开启。',
      buttons: ['登录并授权', '打开官网', '取消'],
      defaultId: 0,
      cancelId: 2,
    })
    if (response === 0) await authorizeRemoteDevice()
    if (response === 1) await openPortalPage('/')
    return
  }

  const enabled = preference.enabled
  const { response } = await showMessageBox({
    type: enabled ? 'info' : 'warning',
    title: '远程访问',
    message: enabled ? '远程控制已开启' : '远程控制已关闭',
    detail: [
      `登录账号：${preference.authorization.accountName}`,
      `连接状态：${remoteStateText()}`,
      '',
      enabled
        ? '电脑正在主动连接中转服务器。只有该账号登录后的浏览器可以申请一次性连接。'
        : '服务器当前不能通过这台电脑访问 DeepSeek Harness。',
    ].join('\n'),
    buttons: [enabled ? '关闭远程控制' : '开启远程控制', '打开设备中心', '重新登录授权', '取消'],
    defaultId: 0,
    cancelId: 3,
  })
  if (response === 0) await applyRemoteAccess({ ...preference, enabled: !enabled })
  if (response === 1) await openPortalPage('/devices')
  if (response === 2) await authorizeRemoteDevice()
}

/** Install the cross-platform application menu containing network access controls. */
function installApplicationMenu(): void {
  const lanItem: Electron.MenuItemConstructorOptions = {
    label: '局域网访问…',
    enabled: lanAccess !== undefined && !reconfiguring,
    click: () => { void showLanAccessDialog() },
  }
  const remoteItem: Electron.MenuItemConstructorOptions = {
    label: authorizationAbort === undefined ? '远程访问…' : '远程访问（等待网页授权）…',
    enabled: remoteAccess !== undefined && authorizationAbort === undefined && !reconfiguring,
    click: () => { void showRemoteAccessDialog() },
  }
  const template: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [
      {
        label: APP_NAME,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          lanItem,
          remoteItem,
          { type: 'separator' },
          { role: 'quit' },
        ],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
      { role: 'windowMenu' },
    ]
    : [
      {
        label: '应用',
        submenu: [lanItem, remoteItem, { type: 'separator' }, { role: 'quit' }],
      },
      { role: 'editMenu' },
      { role: 'viewMenu' },
    ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Start the desktop preference, menu, product window, and managed backend. */
async function start(): Promise<void> {
  try {
    lanAccess = loadLanAccessPreference(app.getPath('userData'))
    remoteAccess = loadRemoteAccessPreference(app.getPath('userData'))
    installApplicationMenu()
    const window = createWindow()
    mainWindow = window
    await launchBackend(window)
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
    if (quitting || (backend === undefined && remoteTunnel === undefined && authorizationAbort === undefined)) return
    event.preventDefault()
    quitting = true
    authorizationAbort?.abort()
    void stopBackend().finally(() => { app.quit() })
  })
  void app.whenReady().then(start)
}
