import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { type RawData, WebSocketServer } from 'ws'
import {
  REMOTE_RPC_POLICY, remoteRpcDisposition, startRemoteTunnel, type RemoteTunnel,
} from '../src/remote-tunnel.ts'

const closers: (() => Promise<void>)[] = []

afterEach(async () => {
  await Promise.all(closers.splice(0).map(close => close()))
})

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => { resolve((server.address() as AddressInfo).port) })
  })
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve) => { server.close(() => { resolve() }) })
}

function nextFrame(socket: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('timed out waiting for tunnel frame')) }, 3_000)
    socket.once('message', (raw) => {
      clearTimeout(timer)
      const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
      resolve(JSON.parse(body.toString('utf8')) as Record<string, unknown>)
    })
  })
}

function collectChunkedResponse(socket: WebSocket, id: string): Promise<{
  start: Record<string, unknown>
  chunks: Buffer[]
}> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { reject(new Error('timed out waiting for chunked tunnel response')) }, 5_000)
    let start: Record<string, unknown> | undefined
    const chunks: Buffer[] = []
    const onMessage = (raw: RawData): void => {
      const body = Buffer.isBuffer(raw) ? raw : Buffer.from(raw as ArrayBuffer)
      const frame = JSON.parse(body.toString('utf8')) as Record<string, unknown>
      if (frame.id !== id) return
      if (frame.type === 'error') {
        clearTimeout(timer)
        socket.off('message', onMessage)
        reject(new Error(String(frame.message)))
        return
      }
      if (frame.type === 'http_response') {
        clearTimeout(timer)
        socket.off('message', onMessage)
        reject(new Error('expected chunked response, received one complete frame'))
        return
      }
      if (frame.type === 'http_response_start') {
        start = frame
        return
      }
      if (frame.type === 'http_response_chunk') {
        chunks.push(Buffer.from(frame.body as string, 'base64'))
        return
      }
      if (frame.type !== 'http_response_end') return
      clearTimeout(timer)
      socket.off('message', onMessage)
      if (start === undefined) reject(new Error('chunked response ended before its start frame'))
      else resolve({ start, chunks })
    }
    socket.on('message', onMessage)
  })
}

describe('desktop remote tunnel', () => {
  it('classifies every privileged RPC and keeps remote workspace browsing available', () => {
    expect(Object.keys(REMOTE_RPC_POLICY).sort())
      .toEqual([
        'agentPresets/copy',
        'agentPresets/deletePreset',
        'agentPresets/read',
        'credentials/describe',
        'credentials/set',
        'credentials/unset',
        'directoryPicker/pick',
        'llm/discoverModels',
        'session/openWorkspacePath',
        'settings/describe',
        'settings/mutate',
        'settings/openAgentPresetDirectory',
        'settings/openSettingsDocument',
        'settings/replace',
        'settings/update',
      ])
    expect(remoteRpcDisposition('directoryPicker/list')).toBe('forward')
    expect(remoteRpcDisposition('directoryPicker/createDirectory')).toBe('forward')
    expect(remoteRpcDisposition('workspace/create')).toBe('forward')
    expect(remoteRpcDisposition('workspace/listFiles')).toBe('forward')
    expect(remoteRpcDisposition('workspace/readFile')).toBe('forward')
  })

  it('proxies only the fixed loopback origin and exposes configuration as read-only', async () => {
    const local = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      if (request.url === '/api/settings/describe') {
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: 'settings-rpc',
          result: {
            ok: true,
            value: {
              writable: true,
              hasDocument: true,
              namespaces: [{ ns: 'llm', value: { apiKey: '<redacted>' } }],
            },
          },
        }))
        return
      }
      if (request.url === '/api/credentials/describe') {
        response.end(JSON.stringify({
          type: 'server-response',
          rpcId: 'credentials-rpc',
          result: {
            ok: true,
            value: {
              DEEPSEEK_API_KEY: { configured: true, source: 'managed', writable: true },
            },
          },
        }))
        return
      }
      if (request.url === '/api/session/page') {
        response.end(Buffer.alloc((1 << 20) + 17, 0x61))
        return
      }
      response.end(JSON.stringify({ path: request.url, forwardedCookie: request.headers.cookie ?? null }))
    })
    const localPort = await listen(local)
    closers.push(() => closeServer(local))

    const relayServer = createServer()
    const relay = new WebSocketServer({ server: relayServer })
    const relayPort = await listen(relayServer)
    closers.push(async () => {
      relay.close()
      await closeServer(relayServer)
    })
    const connected = new Promise<WebSocket>((resolve, reject) => {
      relay.once('connection', (socket, request) => {
        try {
          expect(request.headers.authorization).toBe('Bearer device-token-with-at-least-thirty-two-characters')
          resolve(socket)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    })
    let markOnline: (() => void) | undefined
    const online = new Promise<void>((resolve) => { markOnline = resolve })
    const tunnel: RemoteTunnel = startRemoteTunnel({
      localUrl: `http://127.0.0.1:${String(localPort)}/`,
      authorization: {
        deviceId: 'a'.repeat(32),
        deviceToken: 'device-token-with-at-least-thirty-two-characters',
        tunnelUrl: `ws://127.0.0.1:${String(relayPort)}/api/agent/tunnel`,
        accountName: 'tester', authorizedAt: new Date().toISOString(),
      },
      onStateChange: (state) => { if (state === 'online') markOnline?.() },
    })
    closers.unshift(async () => { await tunnel.stop() })
    const socket = await connected
    await online

    socket.send(JSON.stringify({
      type: 'http_request', id: '1'.repeat(32), method: 'GET', path: '/api/hello?from=relay',
      headers: { Cookie: ['must-not-forward=true'], Accept: ['application/json'] },
    }))
    const response = await nextFrame(socket)
    expect(response).toMatchObject({ type: 'http_response', id: '1'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(response.body as string, 'base64').toString())).toEqual({ path: '/api/hello?from=relay', forwardedCookie: null })

    // The native ws implementation may report a successful send with null
    // instead of undefined. Reproduce that production callback shape so a
    // successful response-start frame cannot become an `error: null` reply.
    type LooseSend = (this: WebSocket, ...args: unknown[]) => void
    const prototype = WebSocket.prototype as unknown as { send: LooseSend }
    const originalSend = prototype.send
    prototype.send = function (...args: unknown[]): void {
      const callbackIndex = typeof args[1] === 'function' ? 1 : 2
      const callback = args[callbackIndex]
      if (typeof callback === 'function') {
        const forwarded = [...args]
        forwarded[callbackIndex] = (error: unknown): void => {
          Reflect.apply(callback, undefined, [error ?? null])
        }
        Reflect.apply(originalSend, this, forwarded)
        return
      }
      Reflect.apply(originalSend, this, args)
    }
    const chunked = await (async () => {
      try {
        const largeResponse = collectChunkedResponse(socket, '8'.repeat(32))
        socket.send(JSON.stringify({
          type: 'http_request', id: '8'.repeat(32), method: 'POST', path: '/api/session/page', body: '',
        }))
        return await largeResponse
      } finally {
        prototype.send = originalSend
      }
    })()
    expect(chunked.start).toMatchObject({ type: 'http_response_start', id: '8'.repeat(32), status: 200 })
    expect(chunked.chunks.length).toBeGreaterThan(1)
    expect(chunked.chunks.every(chunk => chunk.byteLength <= 512 << 10)).toBe(true)
    expect(Buffer.concat(chunked.chunks)).toEqual(Buffer.alloc((1 << 20) + 17, 0x61))

    socket.send(JSON.stringify({
      type: 'http_request', id: '3'.repeat(32), method: 'GET', path: '/assets/index.js',
    }))
    const staticDenied = await nextFrame(socket)
    expect(staticDenied).toMatchObject({ type: 'error', id: '3'.repeat(32), message: 'Remote tunnel only accepts Harness API requests.' })

    socket.send(JSON.stringify({
      type: 'http_request', id: '2'.repeat(32), method: 'POST', path: '/api/settings/describe', body: '',
    }))
    const settings = await nextFrame(socket)
    expect(settings).toMatchObject({ type: 'http_response', id: '2'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(settings.body as string, 'base64').toString())).toEqual({
      type: 'server-response',
      rpcId: 'settings-rpc',
      result: {
        ok: true,
        value: {
          writable: false,
          hasDocument: false,
          namespaces: [{ ns: 'llm', value: { apiKey: '<redacted>' } }],
        },
      },
    })

    socket.send(JSON.stringify({
      type: 'http_request', id: '4'.repeat(32), method: 'POST', path: '/api/credentials/describe', body: '',
    }))
    const credentials = await nextFrame(socket)
    expect(credentials).toMatchObject({ type: 'http_response', id: '4'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(credentials.body as string, 'base64').toString()))
      .toMatchObject({
        result: {
          ok: true,
          value: {
            DEEPSEEK_API_KEY: { configured: true, source: 'managed', writable: false },
          },
        },
      })

    socket.send(JSON.stringify({
      type: 'http_request', id: '5'.repeat(32), method: 'post', path: '/api/settings/mutate', body: '',
    }))
    const writeForbidden = await nextFrame(socket)
    expect(writeForbidden).toMatchObject({ type: 'http_response', id: '5'.repeat(32), status: 403 })

    socket.send(JSON.stringify({
      type: 'http_request', id: '6'.repeat(32), method: 'POST', path: '/api/settings%2Fmutate', body: '',
    }))
    const encodedWriteForbidden = await nextFrame(socket)
    expect(encodedWriteForbidden).toMatchObject({ type: 'http_response', id: '6'.repeat(32), status: 403 })

    socket.send(JSON.stringify({
      type: 'http_request', id: '9'.repeat(32), method: 'POST', path: '/api/directoryPicker/pick', body: '',
    }))
    const nativePickerForbidden = await nextFrame(socket)
    expect(nativePickerForbidden).toMatchObject({ type: 'http_response', id: '9'.repeat(32), status: 403 })

    socket.send(JSON.stringify({
      type: 'http_request', id: 'a'.repeat(32), method: 'POST', path: '/api/directoryPicker/list', body: '',
    }))
    const browsePickerForwarded = await nextFrame(socket)
    expect(browsePickerForwarded).toMatchObject({ type: 'http_response', id: 'a'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(browsePickerForwarded.body as string, 'base64').toString()))
      .toEqual({ path: '/api/directoryPicker/list', forwardedCookie: null })

    socket.send(JSON.stringify({
      type: 'http_request', id: '7'.repeat(32), method: 'POST', path: '/api/settings/describe?malformed=true', body: '',
    }))
    const malformedProjection = await nextFrame(socket)
    expect(malformedProjection).toMatchObject({
      type: 'error',
      id: '7'.repeat(32),
      message: 'Local settings/describe response had an invalid RPC envelope.',
    })
  }, 15_000)
})
