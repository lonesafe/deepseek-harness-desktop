import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createRemoteAccessPreference,
  loadRemoteAccessPreference,
  remoteAccessPreferencePath,
  saveRemoteAccessPreference,
  validatePortalUrl,
} from '../src/remote-access.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

function tempRoot(): string {
  root = mkdtempSync(join(tmpdir(), 'dsh-desktop-remote-access-'))
  return root
}

function authorization() {
  return {
    deviceId: 'a'.repeat(32),
    deviceToken: 'device-token-with-at-least-thirty-two-characters',
    tunnelUrl: 'wss://portal.example.test/api/agent/tunnel',
    accountName: 'tester',
    authorizedAt: '2026-08-15T00:00:00.000Z',
  }
}

describe('desktop remote access preference', () => {
  it('defaults to an unbound disabled official portal', () => {
    expect(loadRemoteAccessPreference(join(tempRoot(), 'missing'))).toEqual({
      version: 1,
      portalUrl: 'https://dsh.roubsite.com',
      enabled: false,
    })
  })

  it('persists a complete authorized preference in a separate owner file', () => {
    const userData = join(tempRoot(), 'user-data')
    const preference = { ...createRemoteAccessPreference('https://portal.example.test'), enabled: true, authorization: authorization() }
    saveRemoteAccessPreference(userData, preference)
    expect(loadRemoteAccessPreference(userData)).toEqual(preference)
    expect(JSON.parse(readFileSync(remoteAccessPreferencePath(userData), 'utf8'))).toEqual(preference)
  })

  it('fails closed on an enabled preference without authorization', () => {
    const userData = join(tempRoot(), 'user-data')
    mkdirSync(userData)
    writeFileSync(remoteAccessPreferencePath(userData), JSON.stringify({ version: 1, portalUrl: 'https://portal.example.test', enabled: true }))
    expect(() => loadRemoteAccessPreference(userData)).toThrow(/requires authorization/u)
  })

  it('requires HTTPS except for exact loopback development origins', () => {
    expect(validatePortalUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(() => validatePortalUrl('http://portal.example.test')).toThrow(/HTTPS origin/u)
    expect(() => validatePortalUrl('https://portal.example.test/path')).toThrow(/HTTPS origin/u)
  })
})
