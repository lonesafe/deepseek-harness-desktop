import { afterEach, describe, expect, it, vi } from 'vitest'
import { pollDeviceAuthorization, startDeviceAuthorization } from '../src/remote-authorization.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('portal device authorization', () => {
  it('creates a same-origin browser authorization', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      device_code: 'd'.repeat(43),
      user_code: 'ABCD-EFGH',
      verification_uri_complete: 'https://portal.example.test/device/authorize?code=ABCD-EFGH',
      expires_in: 600,
      interval: 3,
    }), { status: 201, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetch)
    const pending = await startDeviceAuthorization('https://portal.example.test', { name: 'Mac', platform: 'darwin', appVersion: '1.0.0' })
    expect(pending).toMatchObject({ userCode: 'ABCD-EFGH', intervalMs: 3_000 })
    expect(fetch).toHaveBeenCalledWith('https://portal.example.test/api/device-auth/start', expect.objectContaining({ method: 'POST' }))
  })

  it('rejects a verification page returned on another origin', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      device_code: 'd'.repeat(43), user_code: 'ABCD-EFGH',
      verification_uri_complete: 'https://attacker.example/device/authorize', expires_in: 600, interval: 3,
    }), { status: 201 })))
    await expect(startDeviceAuthorization('https://portal.example.test', { name: 'Mac', platform: 'darwin', appVersion: '1.0.0' }))
      .rejects.toThrow(/different origin/u)
  })

  it('polls pending authorization and returns the device credential once', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: 'pending' }), { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        status: 'authorized', device_id: 'a'.repeat(32),
        device_token: 'token-with-at-least-thirty-two-characters',
        tunnel_url: 'wss://portal.example.test/api/agent/tunnel', account_name: 'tester',
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    const credential = await pollDeviceAuthorization('https://portal.example.test', {
      deviceCode: 'd'.repeat(43), userCode: 'ABCD-EFGH',
      verificationUrl: 'https://portal.example.test/device/authorize',
      expiresAt: Date.now() + 2_000, intervalMs: 1,
    })
    expect(credential).toMatchObject({ deviceId: 'a'.repeat(32), accountName: 'tester' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
