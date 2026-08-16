/** Persistent desktop authorization and explicit remote-control preference. */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const SETTINGS_FILENAME = 'remote-access.json'
const SETTINGS_VERSION = 1
const DEFAULT_PORTAL_URL = 'https://dsh.roubsite.com'
const DEFAULT_TUNNEL_URL = 'wss://remote.dsh.roubsite.com/api/agent/tunnel'

/** Account-owned device credential returned by the portal authorization flow. */
export interface RemoteDeviceAuthorization {
  deviceId: string
  deviceToken: string
  tunnelUrl: string
  accountName: string
  authorizedAt: string
}

/** Durable remote-control state owned by the Electron shell. */
export interface RemoteAccessPreference {
  version: typeof SETTINGS_VERSION
  portalUrl: string
  enabled: boolean
  authorization?: RemoteDeviceAuthorization
}

/** Create an unbound, disabled preference for the configured official portal. */
export function createRemoteAccessPreference(portalUrl = process.env.DSH_PORTAL_URL ?? DEFAULT_PORTAL_URL): RemoteAccessPreference {
  return { version: SETTINGS_VERSION, portalUrl: validatePortalUrl(portalUrl), enabled: false }
}

/** Absolute desktop-owned remote-access settings path. */
export function remoteAccessPreferencePath(userData: string): string {
  return join(userData, SETTINGS_FILENAME)
}

/** Validate an official HTTPS portal URL, with loopback HTTP allowed for development. */
export function validatePortalUrl(raw: string): string {
  const parsed = new URL(raw)
  const loopback = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1'
  if ((parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
    || parsed.username !== '' || parsed.password !== '' || parsed.pathname !== '/'
    || parsed.search !== '' || parsed.hash !== '') {
    throw new Error('portalUrl must be an HTTPS origin (loopback HTTP is allowed for development)')
  }
  return parsed.origin
}

/** Validate a portal-issued tunnel on either the portal or its dedicated remote authority. */
export function validateDeviceTunnelUrl(portalUrl: string, raw: string): string {
  const portal = new URL(validatePortalUrl(portalUrl))
  const tunnel = new URL(raw)
  const expectedProtocol = portal.protocol === 'https:' ? 'wss:' : 'ws:'
  const sameAuthority = tunnel.host === portal.host
  const dedicatedAuthority = tunnel.hostname === `remote.${portal.hostname}` && tunnel.port === portal.port
  if (tunnel.protocol !== expectedProtocol || (!sameAuthority && !dedicatedAuthority)
    || tunnel.username !== '' || tunnel.password !== '' || tunnel.pathname !== '/api/agent/tunnel'
    || tunnel.search !== '' || tunnel.hash !== '') {
    throw new Error('authorization.tunnelUrl must use the portal or its dedicated remote authority')
  }
  if (portal.origin === DEFAULT_PORTAL_URL && sameAuthority) return DEFAULT_TUNNEL_URL
  return tunnel.toString()
}

function parseAuthorization(value: unknown, portalUrl: string): RemoteDeviceAuthorization {
  if (typeof value !== 'object' || value === null) throw new Error('authorization must be an object')
  const candidate = value as Record<string, unknown>
  if (typeof candidate.deviceId !== 'string' || !/^[a-f0-9]{32}$/u.test(candidate.deviceId)) {
    throw new Error('authorization.deviceId is invalid')
  }
  if (typeof candidate.deviceToken !== 'string' || candidate.deviceToken.length < 32) {
    throw new Error('authorization.deviceToken is invalid')
  }
  if (typeof candidate.tunnelUrl !== 'string') throw new Error('authorization.tunnelUrl is invalid')
  const tunnelUrl = validateDeviceTunnelUrl(portalUrl, candidate.tunnelUrl)
  if (typeof candidate.accountName !== 'string' || candidate.accountName === '' || candidate.accountName.length > 64) {
    throw new Error('authorization.accountName is invalid')
  }
  if (typeof candidate.authorizedAt !== 'string' || Number.isNaN(Date.parse(candidate.authorizedAt))) {
    throw new Error('authorization.authorizedAt is invalid')
  }
  return {
    deviceId: candidate.deviceId,
    deviceToken: candidate.deviceToken,
    tunnelUrl,
    accountName: candidate.accountName,
    authorizedAt: candidate.authorizedAt,
  }
}

function parsePreference(value: unknown): RemoteAccessPreference {
  if (typeof value !== 'object' || value === null) throw new Error('expected a JSON object')
  const candidate = value as Record<string, unknown>
  if (candidate.version !== SETTINGS_VERSION) throw new Error(`unsupported version ${String(candidate.version)}`)
  if (typeof candidate.portalUrl !== 'string') throw new Error('portalUrl must be a string')
  if (typeof candidate.enabled !== 'boolean') throw new Error('enabled must be boolean')
  const portalUrl = validatePortalUrl(candidate.portalUrl)
  const authorization = candidate.authorization === undefined ? undefined : parseAuthorization(candidate.authorization, portalUrl)
  if (candidate.enabled && authorization === undefined) throw new Error('enabled remote access requires authorization')
  return {
    version: SETTINGS_VERSION,
    portalUrl,
    enabled: candidate.enabled,
    ...authorization === undefined ? {} : { authorization },
  }
}

/** Load remote access; a missing file returns a disabled unbound preference. */
export function loadRemoteAccessPreference(userData: string): RemoteAccessPreference {
  const path = remoteAccessPreferencePath(userData)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createRemoteAccessPreference()
    throw error
  }
  try {
    return parsePreference(JSON.parse(raw) as unknown)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid remote access settings at ${path}: ${detail}`, { cause: error })
  }
}

/** Atomically persist validated remote access in an owner-only file. */
export function saveRemoteAccessPreference(userData: string, preference: RemoteAccessPreference): void {
  const validated = parsePreference(preference)
  mkdirSync(userData, { recursive: true })
  const path = remoteAccessPreferencePath(userData)
  const temporary = join(userData, `.${SETTINGS_FILENAME}.${String(process.pid)}.${randomBytes(8).toString('hex')}`)
  try {
    writeFileSync(temporary, `${JSON.stringify(validated, undefined, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'Remote access settings write and cleanup failed')
    }
    throw error
  }
}
