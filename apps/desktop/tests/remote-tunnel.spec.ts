import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { WebSocketServer } from 'ws'
import { startRemoteTunnel, type RemoteTunnel } from '../src/remote-tunnel.ts'

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

describe('desktop remote tunnel', () => {
  it('proxies only the fixed loopback origin and exposes configuration as read-only', async () => {
    const local = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      if (request.url === '/api/settings.describe') {
        response.end(JSON.stringify({
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
      if (request.url === '/api/credentials.describe') {
        response.end(JSON.stringify({
          rpcId: 'credentials-rpc',
          result: {
            ok: true,
            value: {
              credentials: {
                DEEPSEEK_API_KEY: { configured: true, source: 'managed', writable: true },
              },
            },
          },
        }))
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

    socket.send(JSON.stringify({
      type: 'http_request', id: '3'.repeat(32), method: 'GET', path: '/assets/index.js',
    }))
    const staticDenied = await nextFrame(socket)
    expect(staticDenied).toMatchObject({ type: 'error', id: '3'.repeat(32), message: 'Remote tunnel only accepts Harness API requests.' })

    socket.send(JSON.stringify({
      type: 'http_request', id: '2'.repeat(32), method: 'POST', path: '/api/settings.describe', body: '',
    }))
    const settings = await nextFrame(socket)
    expect(settings).toMatchObject({ type: 'http_response', id: '2'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(settings.body as string, 'base64').toString())).toEqual({
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
      type: 'http_request', id: '4'.repeat(32), method: 'POST', path: '/api/credentials.describe', body: '',
    }))
    const credentials = await nextFrame(socket)
    expect(credentials).toMatchObject({ type: 'http_response', id: '4'.repeat(32), status: 200 })
    expect(JSON.parse(Buffer.from(credentials.body as string, 'base64').toString()))
      .toMatchObject({
        result: {
          ok: true,
          value: {
            credentials: {
              DEEPSEEK_API_KEY: { configured: true, source: 'managed', writable: false },
            },
          },
        },
      })

    socket.send(JSON.stringify({
      type: 'http_request', id: '5'.repeat(32), method: 'post', path: '/api/settings.mutate', body: '',
    }))
    const writeForbidden = await nextFrame(socket)
    expect(writeForbidden).toMatchObject({ type: 'http_response', id: '5'.repeat(32), status: 403 })

    socket.send(JSON.stringify({
      type: 'http_request', id: '6'.repeat(32), method: 'POST', path: '/api/settings%2Emutate', body: '',
    }))
    const encodedWriteForbidden = await nextFrame(socket)
    expect(encodedWriteForbidden).toMatchObject({ type: 'http_response', id: '6'.repeat(32), status: 403 })

    socket.send(JSON.stringify({
      type: 'http_request', id: '7'.repeat(32), method: 'POST', path: '/api/settings.describe?malformed=true', body: '',
    }))
    const malformedProjection = await nextFrame(socket)
    expect(malformedProjection).toMatchObject({
      type: 'error',
      id: '7'.repeat(32),
      message: 'Local settings.describe response had an invalid RPC envelope.',
    })
  })
})
