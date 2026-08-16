/** Desktop update polling and strict portal response validation. */

export const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000

/** Trusted desktop facts injected by the Electron main process. */
export interface DesktopUpdateConfiguration {
  version: string
  platform: 'darwin' | 'win32' | 'linux'
  arch: 'arm64' | 'x64'
  portalOrigin: string
}

/** Validated update metadata returned by the official portal. */
export interface DesktopUpdate {
  version: string
  fileName: string
  downloadURL: string
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
 * Query the official portal and accept only a same-origin package download.
 *
 * @param configuration Trusted desktop and portal facts.
 * @param signal Optional cancellation signal for the network request.
 * @returns A validated update when available, otherwise undefined.
 */
export async function fetchDesktopUpdate(
  configuration: DesktopUpdateConfiguration,
  signal?: AbortSignal,
): Promise<DesktopUpdate | undefined> {
  const endpoint = new URL('/api/releases/latest', `${configuration.portalOrigin}/`)
  endpoint.searchParams.set('platform', configuration.platform)
  endpoint.searchParams.set('arch', configuration.arch)
  endpoint.searchParams.set('current_version', configuration.version)
  const response = await fetch(endpoint, {
    cache: 'no-store',
    credentials: 'omit',
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`update check failed: HTTP ${response.status}`)
  const body = record(await response.json())
  if (body?.update_available !== true) return undefined
  const release = record(body.release)
  const asset = record(release?.asset)
  if (typeof release?.version !== 'string' || typeof asset?.file_name !== 'string' || typeof asset.download_url !== 'string') {
    throw new Error('update check returned an invalid release')
  }
  const download = new URL(asset.download_url)
  if (download.origin !== configuration.portalOrigin || !download.pathname.startsWith('/downloads/')) {
    throw new Error('update download must use the configured portal')
  }
  return { version: release.version, fileName: asset.file_name, downloadURL: download.toString() }
}
