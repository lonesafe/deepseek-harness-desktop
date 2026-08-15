/** Persistent, desktop-owned LAN access preference and random credential. */

import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MIN_LAN_ACCESS_TOKEN_LENGTH } from '@deepseek-ai/dsh-host-webserver'

const SETTINGS_FILENAME = 'lan-access.json'
const SETTINGS_VERSION = 1

/** Durable desktop LAN exposure preference. */
export interface LanAccessPreference {
  version: typeof SETTINGS_VERSION
  enabled: boolean
  accessToken: string
}

/** Create a disabled preference with a cryptographically random credential. */
export function createLanAccessPreference(): LanAccessPreference {
  return {
    version: SETTINGS_VERSION,
    enabled: false,
    accessToken: randomBytes(24).toString('base64url'),
  }
}

/** Absolute desktop-owned settings file path. */
export function lanAccessPreferencePath(userData: string): string {
  return join(userData, SETTINGS_FILENAME)
}

/** Parse and validate one persisted preference without accepting partial state. */
function parsePreference(value: unknown): LanAccessPreference {
  if (typeof value !== 'object' || value === null) throw new Error('expected a JSON object')
  const candidate = value as Record<string, unknown>
  if (candidate.version !== SETTINGS_VERSION) throw new Error(`unsupported version ${String(candidate.version)}`)
  if (typeof candidate.enabled !== 'boolean') throw new Error('enabled must be boolean')
  if (typeof candidate.accessToken !== 'string'
    || candidate.accessToken.length < MIN_LAN_ACCESS_TOKEN_LENGTH) {
    throw new Error(`accessToken must contain at least ${String(MIN_LAN_ACCESS_TOKEN_LENGTH)} characters`)
  }
  return {
    version: SETTINGS_VERSION,
    enabled: candidate.enabled,
    accessToken: candidate.accessToken,
  }
}

/**
 * Load the preference; an absent file returns a fresh disabled value.
 * @param userData - Electron user-data directory.
 * @returns Valid persisted state or a fresh disabled preference.
 */
export function loadLanAccessPreference(userData: string): LanAccessPreference {
  const path = lanAccessPreferencePath(userData)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return createLanAccessPreference()
    throw error
  }
  try {
    return parsePreference(JSON.parse(raw) as unknown)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid LAN access settings at ${path}: ${detail}`, { cause: error })
  }
}

/**
 * Atomically persist the preference in an owner-only file.
 * @param userData - Electron user-data directory.
 * @param preference - complete validated preference.
 */
export function saveLanAccessPreference(userData: string, preference: LanAccessPreference): void {
  const validated = parsePreference(preference)
  mkdirSync(userData, { recursive: true })
  const path = lanAccessPreferencePath(userData)
  const temporary = join(userData, `.${SETTINGS_FILENAME}.${String(process.pid)}.${randomBytes(8).toString('hex')}`)
  try {
    writeFileSync(temporary, `${JSON.stringify(validated, undefined, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    renameSync(temporary, path)
  } catch (error) {
    try {
      unlinkSync(temporary)
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw new AggregateError([error, cleanupError], 'LAN access settings write and cleanup failed')
    }
    throw error
  }
}
