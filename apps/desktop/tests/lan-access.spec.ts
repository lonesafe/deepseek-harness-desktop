import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  createLanAccessPreference,
  lanAccessPreferencePath,
  loadLanAccessPreference,
  saveLanAccessPreference,
} from '../src/lan-access.ts'

let root: string | undefined

afterEach(() => {
  if (root !== undefined) rmSync(root, { recursive: true, force: true })
  root = undefined
})

function tempRoot(): string {
  root = mkdtempSync(join(tmpdir(), 'dsh-desktop-lan-access-'))
  return root
}

describe('desktop LAN access preference', () => {
  it('defaults to disabled with a strong random token', () => {
    const preference = loadLanAccessPreference(join(tempRoot(), 'missing'))
    expect(preference).toMatchObject({ version: 1, enabled: false })
    expect(preference.accessToken).toHaveLength(32)
    expect(createLanAccessPreference().accessToken).not.toBe(preference.accessToken)
  })

  it('atomically persists and reloads the complete preference', () => {
    const userData = join(tempRoot(), 'user-data')
    const preference = { ...createLanAccessPreference(), enabled: true }
    saveLanAccessPreference(userData, preference)
    expect(loadLanAccessPreference(userData)).toEqual(preference)
    expect(JSON.parse(readFileSync(lanAccessPreferencePath(userData), 'utf8'))).toEqual(preference)
  })

  it('fails closed on malformed or weak persisted settings', () => {
    const userData = join(tempRoot(), 'user-data')
    mkdirSync(userData)
    writeFileSync(lanAccessPreferencePath(userData), JSON.stringify({ version: 1, enabled: true, accessToken: 'short' }))
    expect(() => loadLanAccessPreference(userData)).toThrow(/Invalid LAN access settings.*accessToken/u)
  })
})
