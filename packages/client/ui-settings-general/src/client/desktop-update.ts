/** Desktop update state projected by the trusted Electron main process. */

/** Renderer event carrying desktop-owned update download progress. */
export const DESKTOP_UPDATE_STATE_EVENT = 'dsh-desktop-update-state'

/** Window snapshot key populated before the React settings surface mounts. */
export const DESKTOP_UPDATE_SNAPSHOT_KEY = '__dshDesktopUpdateSnapshot'

/** Trusted navigation action used to cancel the active desktop update. */
export const DESKTOP_UPDATE_CANCEL_URL = 'dsh-update://cancel'

/** Desktop-owned download state delivered without exposing Electron APIs to the renderer. */
export type DesktopUpdateDownloadState =
  | { status: 'idle' | 'checking' | 'cancelling' }
  | { status: 'available'; version: string; fileName: string }
  | {
    status: 'downloading' | 'verifying' | 'cancelling'
    version: string
    fileName: string
    received: number
    total: number
  }

/** Trusted desktop facts injected by the Electron main process. */
export interface DesktopUpdateConfiguration {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'arm64' | 'x64'
  portalOrigin: string
}

/** Bounded desktop facts and update state retained across renderer mounts. */
export interface DesktopUpdateSnapshot {
  configuration: DesktopUpdateConfiguration
  update: DesktopUpdateDownloadState
}

function isLoopback(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

function validPortalOrigin(raw: string): string | undefined {
  try {
    const target = new URL(raw)
    if (target.username !== '' || target.password !== '' || target.pathname !== '/' || target.search !== '' || target.hash !== '') return undefined
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && isLoopback(target.hostname))) return undefined
    return target.origin
  } catch {
    return undefined
  }
}

/**
 * Read Electron-injected update facts; ordinary LAN and remote browsers return undefined.
 *
 * @param search Renderer URL search string.
 * @returns Trusted desktop facts, or undefined outside a valid desktop renderer.
 */
export function desktopUpdateConfiguration(search: string): DesktopUpdateConfiguration | undefined {
  const params = new URLSearchParams(search)
  const version = params.get('dsh_desktop_version') ?? ''
  const platform = params.get('dsh_desktop_platform') ?? ''
  const arch = params.get('dsh_desktop_arch') ?? ''
  const portalOrigin = validPortalOrigin(params.get('dsh_update_origin') ?? '')
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z][0-9A-Za-z.-]*)?$/u.test(version)) return undefined
  if (platform !== 'darwin' && platform !== 'win32' && platform !== 'linux') return undefined
  if (arch !== 'arm64' && arch !== 'x64') return undefined
  if (portalOrigin === undefined) return undefined
  return { version, platform, arch, portalOrigin }
}

function validConfiguration(value: unknown): DesktopUpdateConfiguration | undefined {
  const configuration = record(value)
  if (typeof configuration?.version !== 'string' || typeof configuration.platform !== 'string'
    || typeof configuration.arch !== 'string' || typeof configuration.portalOrigin !== 'string') return undefined
  const params = new URLSearchParams({
    dsh_desktop_version: configuration.version,
    dsh_desktop_platform: configuration.platform,
    dsh_desktop_arch: configuration.arch,
    dsh_update_origin: configuration.portalOrigin,
  })
  return desktopUpdateConfiguration(`?${params.toString()}`)
}

/**
 * Report whether trusted Electron desktop facts are present in this renderer URL.
 *
 * @param search Renderer URL search string.
 * @returns Whether the URL identifies a trusted desktop renderer.
 */
export function isDesktopRenderer(search: string): boolean {
  return desktopUpdateConfiguration(search) !== undefined
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

/**
 * Accept only the finite progress states emitted by the desktop shell.
 * @param value Untrusted custom-event detail received by the renderer.
 * @returns A validated progress state, or undefined for malformed input.
 */
export function desktopUpdateDownloadState(value: unknown): DesktopUpdateDownloadState | undefined {
  const state = record(value)
  if (state?.status === 'idle' || state?.status === 'checking') return { status: state.status }
  if (state?.status === 'available') {
    if (typeof state.version !== 'string' || typeof state.fileName !== 'string') return undefined
    return { status: 'available', version: state.version, fileName: state.fileName }
  }
  if (state?.status === 'cancelling' && state.version === undefined) return { status: 'cancelling' }
  if (state?.status !== 'downloading' && state?.status !== 'verifying' && state?.status !== 'cancelling') return undefined
  if (typeof state.version !== 'string' || typeof state.fileName !== 'string'
    || typeof state.received !== 'number' || !Number.isSafeInteger(state.received) || state.received < 0
    || typeof state.total !== 'number' || !Number.isSafeInteger(state.total) || state.total <= 0
    || state.received > state.total) return undefined
  return {
    status: state.status,
    version: state.version,
    fileName: state.fileName,
    received: state.received,
    total: state.total,
  }
}

/** Validate the main-process snapshot stored on the renderer window. */
export function desktopUpdateSnapshot(value: unknown): DesktopUpdateSnapshot | undefined {
  const snapshot = record(value)
  const configuration = validConfiguration(snapshot?.configuration)
  const update = desktopUpdateDownloadState(snapshot?.update)
  if (configuration === undefined || update === undefined) return undefined
  return { configuration, update }
}
