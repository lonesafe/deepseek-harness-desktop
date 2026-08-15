/** Browser-based portal device authorization for the Electron shell. */

import { setTimeout as delay } from 'node:timers/promises'
import type { RemoteDeviceAuthorization } from './remote-access.ts'

interface DeviceAuthorizationStart {
  device_code: string
  user_code: string
  verification_uri_complete: string
  expires_in: number
  interval: number
}

interface DeviceAuthorizationToken {
  status: 'authorized'
  device_id: string
  device_token: string
  tunnel_url: string
  account_name: string
}

/** Pending browser authorization created for one local desktop. */
export interface PendingDeviceAuthorization {
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresAt: number
  intervalMs: number
}

function endpoint(portalUrl: string, pathname: string): string {
  return new URL(pathname, `${portalUrl}/`).toString()
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: unknown }
    if (typeof body.error === 'string') return body.error
  } catch {
    // A non-JSON portal failure falls back to its status.
  }
  return `Portal request failed with HTTP ${String(response.status)}.`
}

/** Create a short-lived portal authorization and return the browser URL. */
export async function startDeviceAuthorization(
  portalUrl: string,
  device: { name: string; platform: string; appVersion: string },
  signal?: AbortSignal,
): Promise<PendingDeviceAuthorization> {
  const response = await fetch(endpoint(portalUrl, '/api/device-auth/start'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ device_name: device.name, platform: device.platform, app_version: device.appVersion }),
    signal,
  })
  if (!response.ok) throw new Error(await errorMessage(response))
  const body = await response.json() as Partial<DeviceAuthorizationStart>
  if (typeof body.device_code !== 'string' || body.device_code.length < 32
    || typeof body.user_code !== 'string'
    || typeof body.verification_uri_complete !== 'string'
    || typeof body.expires_in !== 'number' || body.expires_in < 30
    || typeof body.interval !== 'number' || body.interval < 1) {
    throw new Error('Portal returned an invalid device authorization.')
  }
  const verification = new URL(body.verification_uri_complete)
  const portal = new URL(portalUrl)
  if (verification.origin !== portal.origin || verification.username !== '' || verification.password !== '') {
    throw new Error('Portal returned an authorization URL on a different origin.')
  }
  return {
    deviceCode: body.device_code,
    userCode: body.user_code,
    verificationUrl: verification.toString(),
    expiresAt: Date.now() + body.expires_in * 1000,
    intervalMs: body.interval * 1000,
  }
}

/** Poll until the browser grants the device and return its long-lived credential. */
export async function pollDeviceAuthorization(
  portalUrl: string,
  pending: PendingDeviceAuthorization,
  signal?: AbortSignal,
): Promise<RemoteDeviceAuthorization> {
  while (Date.now() < pending.expiresAt) {
    await delay(pending.intervalMs, undefined, { signal })
    const response = await fetch(endpoint(portalUrl, '/api/device-auth/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ device_code: pending.deviceCode }),
      signal,
    })
    if (response.status === 202) continue
    if (!response.ok) throw new Error(await errorMessage(response))
    const body = await response.json() as Partial<DeviceAuthorizationToken>
    if (body.status !== 'authorized'
      || typeof body.device_id !== 'string'
      || typeof body.device_token !== 'string'
      || typeof body.tunnel_url !== 'string'
      || typeof body.account_name !== 'string') {
      throw new Error('Portal returned an invalid device credential.')
    }
    const tunnel = new URL(body.tunnel_url)
    const portal = new URL(portalUrl)
    const expectedProtocol = portal.protocol === 'https:' ? 'wss:' : 'ws:'
    if (tunnel.protocol !== expectedProtocol || tunnel.host !== portal.host
      || tunnel.username !== '' || tunnel.password !== '' || tunnel.pathname !== '/api/agent/tunnel') {
      throw new Error('Portal returned a device tunnel on an invalid authority.')
    }
    return {
      deviceId: body.device_id,
      deviceToken: body.device_token,
      tunnelUrl: tunnel.toString(),
      accountName: body.account_name,
      authorizedAt: new Date().toISOString(),
    }
  }
  throw new Error('Device authorization expired. Please start again.')
}
