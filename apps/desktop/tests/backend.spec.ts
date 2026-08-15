import { describe, expect, it } from 'vitest'
import { extractHarnessReady, extractHarnessUrl, harnessArguments, harnessHome } from '../src/backend.ts'

describe('desktop backend readiness', () => {
  it('extracts only the loopback readiness URL', () => {
    expect(extractHarnessUrl('booting\ndsh web: http://127.0.0.1:43119\n')).toBe('http://127.0.0.1:43119')
    expect(extractHarnessUrl('dsh web: http://0.0.0.0:43119')).toBeUndefined()
  })

  it('accepts the optional LAN display suffix without widening the app origin', () => {
    expect(extractHarnessUrl('dsh web: http://127.0.0.1:3080 (LAN: http://10.0.0.8:3080)\n'))
      .toBe('http://127.0.0.1:3080')
    expect(extractHarnessReady('dsh web: http://127.0.0.1:3080 (LAN: http://10.0.0.8:3080)\n'))
      .toEqual({ localUrl: 'http://127.0.0.1:3080', lanUrl: 'http://10.0.0.8:3080' })
  })

  it('adds authenticated all-interfaces arguments only when LAN access is enabled', () => {
    expect(harnessArguments('/runtime/dsh.js', {
      enabled: true,
      accessToken: 'desktop-lan-access-token-1234',
    })).toEqual([
      '--expose-internals',
      '/runtime/dsh.js',
      'web',
      '--port',
      '0',
      '--host',
      '0.0.0.0',
      '--access-token',
      'desktop-lan-access-token-1234',
    ])
    expect(harnessArguments('/runtime/dsh.js', {
      enabled: false,
      accessToken: 'desktop-lan-access-token-1234',
    })).toEqual(harnessArguments('/runtime/dsh.js'))
  })

  it('exposes Node internals before loading the production Web profile', () => {
    expect(harnessArguments('/runtime/dsh.js')).toEqual([
      '--expose-internals',
      '/runtime/dsh.js',
      'web',
      '--port',
      '0',
    ])
  })

  it('isolates Harness files from Electron user data', () => {
    expect(harnessHome('/app-data')).toBe('/app-data/runtime')
  })
})
