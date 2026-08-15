/** Outbound authenticated tunnel from the desktop to the public relay. */

import { setTimeout as delay } from 'node:timers/promises'
import WebSocket, { type RawData } from 'ws'
import type { RemoteDeviceAuthorization } from './remote-access.ts'

const MAX_TUNNEL_BODY_BYTES = 24 << 20
const READ_ONLY_REMOTE_METHODS = new Set([
  'settings.describe',
  'credentials.describe',
])
const PRIVILEGED_REMOTE_METHODS = new Set([
  'agentPreset.read',
  'agentPreset.copy',
  'agentPreset.openDocument',
  'agentPreset.remove',
  'host.pickDirectory',
  'host.openPath',
  'settings.openDocument',
  'settings.update',
  'settings.replace',
  'settings.mutate',
  'credentials.set',
  'credentials.unset',
  'llm.discoverModels',
])

interface TunnelFrame {
  type: string
  id?: string
  method?: string
  path?: string
  status?: number
  headers?: Record<string, string[]>
  body?: string
  binary?: boolean
  message?: string
}

/** Observable tunnel states used by the desktop menu. */
export type RemoteTunnelState = 'connecting' | 'online' | 'offline' | 'stopped'

/** Managed reconnecting remote tunnel. */
export interface RemoteTunnel {
  /** End reconnection, close local WebSockets, and await quiescence. */
  stop(): Promise<void>
}

/** Start an outbound relay connection which only targets the supplied loopback origin. */
export function startRemoteTunnel(options: {
  localUrl: string
  authorization: RemoteDeviceAuthorization
  onStateChange(state: RemoteTunnelState): void
}): RemoteTunnel {
  const controller = new AbortController()
  let socket: WebSocket | undefined
  const localSockets = new Map<string, WebSocket>()
  let currentState: RemoteTunnelState | undefined
  const publish = (state: RemoteTunnelState): void => {
    if (currentState === state) return
    currentState = state
    options.onStateChange(state)
  }

  const run = async (): Promise<void> => {
    let retryMs = 1_000
    while (true) {
      if (abortRequested(controller.signal)) break
      publish('connecting')
      try {
        socket = await connect(options.authorization, controller.signal)
        retryMs = 1_000
        publish('online')
        await serve(socket, options.localUrl, localSockets, controller.signal)
      } catch {
        if (!abortRequested(controller.signal)) publish('offline')
      } finally {
        for (const local of localSockets.values()) local.close()
        localSockets.clear()
        socket?.close()
        socket = undefined
      }
      if (abortRequested(controller.signal)) break
      try {
        await delay(retryMs, undefined, { signal: controller.signal })
      } catch {
        break
      }
      retryMs = Math.min(retryMs * 2, 30_000)
    }
    publish('stopped')
  }
  const done = run()
  return {
    async stop() {
      controller.abort()
      socket?.close()
      for (const local of localSockets.values()) local.close()
      await done
    },
  }
}

function abortRequested(signal: AbortSignal): boolean {
  return signal.aborted
}

function connect(authorization: RemoteDeviceAuthorization, signal: AbortSignal): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(authorization.tunnelUrl, {
      headers: { Authorization: `Bearer ${authorization.deviceToken}` },
      handshakeTimeout: 15_000,
      maxPayload: MAX_TUNNEL_BODY_BYTES * 2,
    })
    const abort = (): void => {
      socket.close()
      reject(signal.reason instanceof Error ? signal.reason : new Error('Remote tunnel stopped.'))
    }
    const fail = (error: Error): void => {
      signal.removeEventListener('abort', abort)
      reject(error)
    }
    socket.once('error', fail)
    socket.once('unexpected-response', (_request, response) => {
      fail(new Error(`Portal refused the device tunnel with HTTP ${String(response.statusCode)}.`))
    })
    socket.once('open', () => {
      signal.removeEventListener('abort', abort)
      socket.off('error', fail)
      resolve(socket)
    })
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
  })
}

function serve(
  socket: WebSocket,
  localUrl: string,
  localSockets: Map<string, WebSocket>,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const finish = (): void => {
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
    socket.once('close', finish)
    socket.on('message', (raw, binary) => {
      if (binary || rawByteLength(raw) > MAX_TUNNEL_BODY_BYTES * 2) {
        socket.close(1009, 'invalid tunnel message')
        return
      }
      let frame: TunnelFrame
      try {
        frame = JSON.parse(rawToBuffer(raw).toString('utf8')) as TunnelFrame
      } catch {
        socket.close(1007, 'invalid tunnel JSON')
        return
      }
      void handleFrame(socket, localUrl, localSockets, frame, signal).catch((error: unknown) => {
        if (frame.id === undefined) return
        safeSend(socket, { type: 'error', id: frame.id, message: error instanceof Error ? error.message : String(error) })
      })
    })
  })
}

async function handleFrame(
  tunnel: WebSocket,
  localUrl: string,
  localSockets: Map<string, WebSocket>,
  frame: TunnelFrame,
  signal: AbortSignal,
): Promise<void> {
  if (frame.id === undefined || !/^[a-f0-9]{32}$/u.test(frame.id)) throw new Error('Invalid tunnel request ID.')
  if (frame.type === 'http_request') {
    await handleHttp(tunnel, localUrl, frame, signal)
    return
  }
  if (frame.type === 'ws_open') {
    openLocalWebSocket(tunnel, localUrl, localSockets, frame)
    return
  }
  if (frame.type === 'ws_data') {
    const local = localSockets.get(frame.id)
    if (local === undefined || local.readyState !== WebSocket.OPEN) throw new Error('Local WebSocket is not open.')
    const body = decodeBody(frame.body)
    local.send(body, { binary: frame.binary === true })
    return
  }
  if (frame.type === 'ws_close') {
    localSockets.get(frame.id)?.close()
    localSockets.delete(frame.id)
    return
  }
  throw new Error('Unsupported tunnel frame.')
}

async function handleHttp(tunnel: WebSocket, localUrl: string, frame: TunnelFrame, signal: AbortSignal): Promise<void> {
  if (typeof frame.method !== 'string' || typeof frame.path !== 'string') throw new Error('Invalid HTTP tunnel request.')
  if (!isApiPath(frame.path)) throw new Error('Remote tunnel only accepts Harness API requests.')
  const target = localTarget(localUrl, frame.path)
  if (isPrivilegedRequest(target, frame.method)) {
    safeSend(tunnel, {
      type: 'http_response', id: frame.id, status: 403,
      headers: { 'Content-Type': ['text/plain; charset=utf-8'], 'Cache-Control': ['no-store'] },
      body: Buffer.from('This operation is available only in the local desktop window.').toString('base64'),
    })
    return
  }
  const body = decodeBody(frame.body)
  if (body.byteLength > MAX_TUNNEL_BODY_BYTES) throw new Error('Remote request body is too large.')
  const requestBody = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
  const response = await fetch(target, {
    method: frame.method,
    headers: requestHeaders(frame.headers),
    body: body.byteLength === 0 || frame.method === 'GET' || frame.method === 'HEAD' ? undefined : requestBody,
    redirect: 'manual',
    signal,
  })
  const responseBody = projectReadOnlyResponse(
    target,
    frame.method,
    Buffer.from(await response.arrayBuffer()),
  )
  if (responseBody.byteLength > MAX_TUNNEL_BODY_BYTES) throw new Error('Local response body is too large for remote access.')
  safeSend(tunnel, {
    type: 'http_response', id: frame.id, status: response.status,
    headers: responseHeaders(response.headers, localUrl),
    body: responseBody.toString('base64'),
  })
}

function openLocalWebSocket(
  tunnel: WebSocket,
  localUrl: string,
  localSockets: Map<string, WebSocket>,
  frame: TunnelFrame,
): void {
  if (typeof frame.path !== 'string' || frame.id === undefined) throw new Error('Invalid WebSocket tunnel request.')
  if (!isApiPath(frame.path)) throw new Error('Remote tunnel only accepts Harness API WebSockets.')
  const target = localTarget(localUrl, frame.path)
  target.protocol = 'ws:'
  const protocols = frame.headers?.['Sec-Websocket-Protocol'] ?? frame.headers?.['sec-websocket-protocol']
  const local = new WebSocket(target, protocols?.flatMap(value => value.split(',').map(item => item.trim()).filter(Boolean)))
  localSockets.set(frame.id, local)
  let opened = false
  local.once('open', () => {
    opened = true
    safeSend(tunnel, { type: 'ws_opened', id: frame.id })
  })
  local.on('message', (body, binary) => {
    safeSend(tunnel, { type: 'ws_data', id: frame.id, body: rawToBuffer(body).toString('base64'), binary })
  })
  local.once('error', (error) => {
    if (!opened) safeSend(tunnel, { type: 'error', id: frame.id, message: error.message })
  })
  local.once('close', () => {
    localSockets.delete(frame.id as string)
    if (opened) safeSend(tunnel, { type: 'ws_close', id: frame.id })
  })
}

function localTarget(localUrl: string, path: string): URL {
  if (!path.startsWith('/')) throw new Error('Tunnel target must be an absolute path.')
  const base = new URL(localUrl)
  const target = new URL(path, base)
  if (target.origin !== base.origin) throw new Error('Tunnel target escaped the local Harness origin.')
  return target
}

function isApiPath(path: string): boolean {
  const pathname = path.split('?', 1)[0]
  return pathname === '/api' || pathname.startsWith('/api/')
}

function isPrivilegedRequest(target: URL, method: string): boolean {
  if (method.toUpperCase() !== 'POST') return false
  const rpcMethod = rpcMethodFrom(target)
  return rpcMethod !== undefined && PRIVILEGED_REMOTE_METHODS.has(rpcMethod)
}

function projectReadOnlyResponse(target: URL, method: string, body: Buffer): Buffer {
  if (method.toUpperCase() !== 'POST') return body
  const rpcMethod = rpcMethodFrom(target)
  if (rpcMethod === undefined || !READ_ONLY_REMOTE_METHODS.has(rpcMethod)) return body
  let envelope: unknown
  try {
    envelope = JSON.parse(body.toString('utf8')) as unknown
  } catch (error) {
    throw new Error(`Local ${rpcMethod} response was not valid JSON.`, { cause: error })
  }
  if (!isRecord(envelope) || !isRecord(envelope.result)) {
    throw new Error(`Local ${rpcMethod} response had an invalid RPC envelope.`)
  }
  if (envelope.result.ok !== true) return body
  if (!isRecord(envelope.result.value)) {
    throw new Error(`Local ${rpcMethod} response had an invalid result.`)
  }
  const value = envelope.result.value
  if (rpcMethod === 'settings.describe') {
    value.writable = false
    value.hasDocument = false
  } else {
    if (!isRecord(value.credentials)) {
      throw new Error('Local credentials.describe response had an invalid credential map.')
    }
    for (const credential of Object.values(value.credentials)) {
      if (!isRecord(credential)) {
        throw new Error('Local credentials.describe response had an invalid credential entry.')
      }
      credential.writable = false
    }
  }
  return Buffer.from(JSON.stringify(envelope))
}

function rpcMethodFrom(target: URL): string | undefined {
  if (!target.pathname.startsWith('/api/')) return undefined
  try {
    return decodeURIComponent(target.pathname.slice('/api/'.length))
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requestHeaders(source: Record<string, string[]> | undefined): Headers {
  const headers = new Headers()
  const allowed = new Set(['accept', 'accept-language', 'content-type', 'if-modified-since', 'if-none-match', 'range'])
  for (const [name, values] of Object.entries(source ?? {})) {
    if (!allowed.has(name.toLowerCase())) continue
    for (const value of values) headers.append(name, value)
  }
  return headers
}

function responseHeaders(source: Headers, localUrl: string): Record<string, string[]> {
  const target: Record<string, string[]> = {}
  const allowed = new Set(['accept-ranges', 'cache-control', 'content-disposition', 'content-language', 'content-range', 'content-type', 'etag', 'expires', 'last-modified', 'location'])
  for (const [name, value] of source) {
    if (!allowed.has(name.toLowerCase())) continue
    let safeValue = value
    if (name.toLowerCase() === 'location') {
      try {
        const local = new URL(localUrl)
        const redirect = new URL(value, local)
        if (redirect.origin === local.origin) safeValue = `${redirect.pathname}${redirect.search}${redirect.hash}`
      } catch {
        continue
      }
    }
    target[name] = [safeValue]
  }
  return target
}

function decodeBody(value: string | undefined): Buffer {
  if (value === undefined || value === '') return Buffer.alloc(0)
  return Buffer.from(value, 'base64')
}

function safeSend(socket: WebSocket, frame: TunnelFrame): void {
  if (socket.readyState !== WebSocket.OPEN) return
  socket.send(JSON.stringify(frame))
}

function rawByteLength(raw: RawData): number {
  if (Array.isArray(raw)) return raw.reduce((total, part) => total + part.byteLength, 0)
  return raw.byteLength
}

function rawToBuffer(raw: RawData): Buffer {
  if (Array.isArray(raw)) return Buffer.concat(raw)
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw)
}
