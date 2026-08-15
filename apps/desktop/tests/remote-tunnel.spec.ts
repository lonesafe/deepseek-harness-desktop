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
  it('proxies only the fixed loopback origin and blocks privileged local methods', async () => {
    const local = createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
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
    const forbidden = await nextFrame(socket)
    expect(forbidden).toMatchObject({ type: 'http_response', id: '2'.repeat(32), status: 403 })
  })
})
