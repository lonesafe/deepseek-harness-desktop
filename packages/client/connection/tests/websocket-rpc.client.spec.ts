// @vitest-environment jsdom
/** Browser WebSocket RPC carrier framing, multiplexing, cancellation, and protocol failures. */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Blob as NodeBlob } from 'node:buffer'

const uuidState = vi.hoisted(() => ({ value: 'request-id', queue: [] as string[] }))
vi.mock('../src/client/random-uuid.ts', () => ({ randomUuid: () => uuidState.queue.shift() ?? uuidState.value }))

import { WebSocketRpcTransport } from '../src/client/websocket-rpc.ts'

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  bufferedAmount = 0
  binaryType = ''
  readonly sent: unknown[] = []
  readonly closes: Array<{ code?: number | undefined; reason?: string | undefined }> = []
  sendFailure: unknown
  closeFailure: unknown
  onSend: ((value: unknown) => void) | undefined

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  send(value: unknown): void {
    if (this.sendFailure !== undefined) throw this.sendFailure
    this.sent.push(value)
    this.onSend?.(value)
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason })
    if (this.closeFailure !== undefined) throw this.closeFailure
    this.readyState = FakeWebSocket.CLOSED
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  failOpen(): void {
    this.dispatchEvent(new Event('error'))
  }

  serverClose(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  message(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

interface StartedRequest {
  readonly promise: Promise<Response>
  readonly socket: FakeWebSocket
  readonly id: string
}

async function startedRequest(
  transport = new WebSocketRpcTransport('/remote-rpc'),
  signal?: AbortSignal,
  body: unknown = { jsonrpc: '2.0' },
): Promise<StartedRequest> {
  const promise = transport.request('/api/rpc', body, signal)
  const socket = FakeWebSocket.instances.at(-1)
  if (socket === undefined) throw new Error('transport did not create a WebSocket')
  socket.open()
  await vi.waitFor(() => { expect(socket.sent.length).toBeGreaterThanOrEqual(3) })
  const start = JSON.parse(socket.sent[0] as string) as { id: string }
  return { promise, socket, id: start.id }
}

function binary(id: string, content: Uint8Array): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id)
  const value = new Uint8Array(2 + idBytes.byteLength + content.byteLength)
  new DataView(value.buffer).setUint16(0, idBytes.byteLength)
  value.set(idBytes, 2)
  value.set(content, 2 + idBytes.byteLength)
  return value.buffer
}

function startFrame(id: string, headers?: Record<string, string[]>): string {
  return JSON.stringify({ type: 'rpc_response_start', id, status: 200, headers })
}

beforeEach(() => {
  FakeWebSocket.instances.length = 0
  uuidState.value = 'request-id'
  uuidState.queue = []
  vi.stubGlobal('WebSocket', FakeWebSocket)
  vi.stubGlobal('Blob', NodeBlob)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('WebSocketRpcTransport', () => {
  it('frames a request and assembles response headers and binary chunks', async () => {
    const controller = new AbortController()
    const remove = vi.spyOn(controller.signal, 'removeEventListener')
    const transport = new WebSocketRpcTransport('/remote-rpc')
    const request = await startedRequest(transport, controller.signal, { text: '你好' })
    expect(request.socket.url).toBe('ws://localhost:3000/remote-rpc')
    expect(request.socket.binaryType).toBe('arraybuffer')
    expect(JSON.parse(request.socket.sent[0] as string)).toMatchObject({
      type: 'rpc_request_start', id: request.id, path: '/api/rpc',
    })
    expect(request.socket.sent[1]).toBeInstanceOf(ArrayBuffer)
    expect(JSON.parse(request.socket.sent[2] as string)).toEqual({ type: 'rpc_request_end', id: request.id })

    request.socket.message(startFrame(request.id, { 'content-type': ['text/plain'], 'x-value': ['one', 'two'] }))
    request.socket.message(binary(request.id, new TextEncoder().encode('hello ')))
    const blob = new Blob([])
    vi.spyOn(blob, 'arrayBuffer').mockResolvedValue(binary(request.id, new TextEncoder().encode('world')))
    request.socket.message(blob)
    request.socket.message(JSON.stringify({ type: 'rpc_response_end', id: request.id }))
    const response = await request.promise
    expect(response.status).toBe(200)
    expect(response.headers.get('x-value')).toBe('one, two')
    await expect(response.text()).resolves.toBe('hello world')
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))

    uuidState.value = 'second-id'
    const second = transport.request('/api/second', {}, undefined)
    await vi.waitFor(() => { expect(request.socket.sent).toHaveLength(6) })
    expect(FakeWebSocket.instances).toHaveLength(1)
    request.socket.message(startFrame('second-id'))
    request.socket.message(JSON.stringify({ type: 'rpc_response_end', id: 'second-id' }))
    await expect(second).resolves.toBeInstanceOf(Response)
  })

  it('maps server RPC errors and a later socket close across pending requests', async () => {
    const first = await startedRequest()
    first.socket.message(JSON.stringify({ type: 'rpc_error', id: first.id, message: 'remote refused' }))
    await expect(first.promise).rejects.toThrow('remote refused')

    uuidState.value = 'pending-id'
    const transport = new WebSocketRpcTransport('/other')
    const pending = await startedRequest(transport)
    pending.socket.serverClose()
    await expect(pending.promise).rejects.toThrow('远程 WebSocket RPC 连接已断开')
  })

  it('rejects connection error and close events before opening', async () => {
    const errorTransport = new WebSocketRpcTransport('/error')
    const failed = errorTransport.request('/api/rpc', {}, undefined)
    FakeWebSocket.instances.at(-1)!.failOpen()
    await expect(failed).rejects.toThrow('远程 WebSocket RPC 连接失败')

    const closeTransport = new WebSocketRpcTransport('/close')
    const closed = closeTransport.request('/api/rpc', {}, undefined)
    FakeWebSocket.instances.at(-1)!.serverClose()
    await expect(closed).rejects.toThrow('远程 WebSocket RPC 连接已断开')
  })

  it('honors cancellation before opening, while opening, after opening, and during send', async () => {
    const already = new AbortController()
    already.abort(new Error('already cancelled'))
    await expect(new WebSocketRpcTransport('/rpc').request('/api', {}, already.signal))
      .rejects.toThrow('already cancelled')

    const fallback = new AbortController()
    fallback.abort('plain reason')
    await expect(new WebSocketRpcTransport('/rpc').request('/api', {}, fallback.signal))
      .rejects.toMatchObject({ name: 'AbortError' })

    const opening = new AbortController()
    const openingRequest = new WebSocketRpcTransport('/rpc').request('/api', {}, opening.signal)
    opening.abort()
    await expect(openingRequest).rejects.toMatchObject({ name: 'AbortError' })

    const active = new AbortController()
    const request = await startedRequest(new WebSocketRpcTransport('/rpc'), active.signal)
    active.abort(new Error('stop active'))
    await expect(request.promise).rejects.toThrow('stop active')
    expect(JSON.parse(request.socket.sent.at(-1) as string)).toEqual({ type: 'rpc_cancel', id: request.id })
    active.abort()

    const sendFailure = new WebSocketRpcTransport('/rpc')
    const failed = sendFailure.request('/api', {}, undefined)
    const socket = FakeWebSocket.instances.at(-1)!
    socket.sendFailure = 'send failed'
    socket.open()
    await expect(failed).rejects.toThrow('send failed')
  })

  it('contains cancellation-send failures and rejects an abort racing the open event', async () => {
    const active = new AbortController()
    const request = await startedRequest(new WebSocketRpcTransport('/rpc'), active.signal)
    request.socket.sendFailure = new Error('cancel send failed')
    active.abort()
    await expect(request.promise).rejects.toMatchObject({ name: 'AbortError' })

    const racing = new AbortController()
    const promise = new WebSocketRpcTransport('/rpc').request('/api', {}, racing.signal)
    const socket = FakeWebSocket.instances.at(-1)!
    socket.open()
    racing.abort(new Error('open race'))
    await expect(promise).rejects.toThrow('open race')
  })

  it('detects cancellation after reusing an open socket and handles duplicate abort cleanup', async () => {
    const transport = new WebSocketRpcTransport('/rpc')
    const seed = await startedRequest(transport)
    seed.socket.message(startFrame(seed.id))
    seed.socket.message(JSON.stringify({ type: 'rpc_response_end', id: seed.id }))
    await seed.promise

    const controller = new AbortController()
    uuidState.value = 'reuse-id'
    const raced = transport.request('/api', {}, controller.signal)
    controller.abort(new Error('reuse race'))
    await expect(raced).rejects.toThrow('reuse race')

    uuidState.value = 'manual-abort'
    const manualTransport = new WebSocketRpcTransport('/manual-internal')
    const internal = await startedRequest(manualTransport)
    const entry = (manualTransport as unknown as {
      pending: Map<string, { handleAbort(): void }>
    }).pending.get(internal.id)!
    internal.socket.readyState = FakeWebSocket.CLOSED
    entry.handleAbort()
    entry.handleAbort()
    await expect(internal.promise).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('shares one opening socket between concurrent requests', async () => {
    const transport = new WebSocketRpcTransport('/rpc')
    uuidState.queue = ['first-opening', 'second-opening']
    const first = transport.request('/one', {}, undefined)
    const socket = FakeWebSocket.instances.at(-1)!
    const second = transport.request('/two', {}, undefined)
    expect(FakeWebSocket.instances).toHaveLength(1)
    socket.open()
    await vi.waitFor(() => { expect(socket.sent).toHaveLength(6) })
    for (const id of ['first-opening', 'second-opening']) {
      socket.message(startFrame(id))
      socket.message(JSON.stringify({ type: 'rpc_response_end', id }))
    }
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
  })

  it('selects wss for an HTTPS page and isolates a close from a superseding socket', async () => {
    vi.stubGlobal('location', { origin: 'https://portal.example' })
    const transport = new WebSocketRpcTransport('/rpc')
    const request = transport.request('/api', {}, undefined)
    const socket = FakeWebSocket.instances.at(-1)!
    expect(socket.url).toBe('wss://portal.example/rpc')
    const replacement = new FakeWebSocket('wss://portal.example/replacement')
    ;(transport as unknown as { socket: WebSocket }).socket = replacement as unknown as WebSocket
    socket.serverClose()
    replacement.open()
    socket.open()
    await expect(request).rejects.toThrow('远程 WebSocket RPC 连接已断开')
  })

  it('normalizes opening failures for signalled callers and immediately-aborted signal implementations', async () => {
    const controller = new AbortController()
    const failed = new WebSocketRpcTransport('/rpc').request('/api', {}, controller.signal)
    FakeWebSocket.instances.at(-1)!.failOpen()
    await expect(failed).rejects.toThrow('远程 WebSocket RPC 连接失败')

    const transport = new WebSocketRpcTransport('/rpc')
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- verifies normalization of a non-Error opening failure.
    ;(transport as unknown as { opening: Promise<WebSocket> }).opening = Promise.reject('plain opening failure')
    await expect(transport.request('/api', {}, new AbortController().signal)).rejects.toThrow('plain opening failure')

    let reads = 0
    const listeners = new Map<string, EventListenerOrEventListenerObject>()
    const unusualSignal = {
      get aborted() { reads++; return reads >= 2 },
      reason: undefined,
      addEventListener(type: string, listener: EventListenerOrEventListenerObject) { listeners.set(type, listener) },
      removeEventListener(type: string) { listeners.delete(type) },
    } as unknown as AbortSignal
    await expect(new WebSocketRpcTransport('/rpc').request('/api', {}, unusualSignal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('handles cancellation and disconnects during multi-chunk request sends', async () => {
    const controller = new AbortController()
    const transport = new WebSocketRpcTransport('/rpc')
    const cancelled = transport.request('/api', 'x'.repeat((512 << 10) + 1), controller.signal)
    const socket = FakeWebSocket.instances.at(-1)!
    socket.onSend = (value) => {
      if (value instanceof ArrayBuffer) controller.abort(new Error('chunk cancelled'))
    }
    socket.open()
    await expect(cancelled).rejects.toThrow('chunk cancelled')

    const disconnected = new WebSocketRpcTransport('/rpc').request('/api', {}, undefined)
    const closed = FakeWebSocket.instances.at(-1)!
    closed.onSend = (value) => {
      if (typeof value !== 'string') return
      const frame: unknown = JSON.parse(value)
      if (typeof frame === 'object' && frame !== null && 'type' in frame && frame.type === 'rpc_request_start') {
        closed.readyState = FakeWebSocket.CLOSED
      }
    }
    closed.open()
    await expect(disconnected).rejects.toThrow('远程 WebSocket RPC 连接已断开')
  })

  it('ignores a delayed send failure after cancellation removed the request', async () => {
    const transport = new WebSocketRpcTransport('/rpc')
    const send = Promise.withResolvers<undefined>()
    vi.spyOn(
      transport as unknown as { sendRequest(): Promise<void> },
      'sendRequest',
    ).mockReturnValue(send.promise)
    const controller = new AbortController()
    const request = transport.request('/api', {}, controller.signal)
    FakeWebSocket.instances.at(-1)!.open()
    await vi.waitFor(() => {
      expect((transport as unknown as { pending: Map<string, unknown> }).pending.size).toBe(1)
    })
    const expectation = expect(request).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    send.reject(new Error('late send failure'))
    await expectation
  })

  it('rejects oversized requests and invalid generated transport ids', async () => {
    await expect(new WebSocketRpcTransport('/rpc').request('/api', 'x'.repeat((24 << 20) + 1), undefined))
      .rejects.toThrow('远程请求内容过大')
    expect(FakeWebSocket.instances).toHaveLength(0)

    uuidState.value = ''
    const empty = new WebSocketRpcTransport('/rpc').request('/api', {}, undefined)
    FakeWebSocket.instances.at(-1)!.open()
    await expect(empty).rejects.toThrow('transport id is invalid')
    uuidState.value = 'x'.repeat(129)
    const long = new WebSocketRpcTransport('/rpc').request('/api', {}, undefined)
    FakeWebSocket.instances.at(-1)!.open()
    await expect(long).rejects.toThrow('transport id is invalid')
  })

  it.each([
    null,
    {},
    { type: 1, id: 'request-id' },
    { type: 'rpc_response_start', id: '', status: 200 },
    { type: 'rpc_response_start', id: 'request-id', status: 99 },
    { type: 'rpc_response_start', id: 'request-id', status: 600 },
    { type: 'rpc_response_start', id: 'request-id', status: 200.5 },
    { type: 'rpc_response_start', id: 'request-id', status: 200, headers: 'bad' },
    { type: 'rpc_error', id: 'request-id', message: 1 },
    { type: 'unknown', id: 'request-id' },
  ])('rejects invalid control frame %#', async (frame) => {
    const request = await startedRequest()
    request.socket.message(JSON.stringify(frame))
    await expect(request.promise).rejects.toBeInstanceOf(Error)
    expect(request.socket.closes).toContainEqual({ code: 1002, reason: 'invalid RPC frame' })
  })

  it('rejects malformed JSON, duplicated starts, early ends, and malformed response headers', async () => {
    const malformed = await startedRequest()
    malformed.socket.message('{')
    await expect(malformed.promise).rejects.toBeInstanceOf(SyntaxError)

    const duplicate = await startedRequest()
    duplicate.socket.message(startFrame(duplicate.id))
    duplicate.socket.message(startFrame(duplicate.id))
    await expect(duplicate.promise).rejects.toThrow('response started more than once')

    const early = await startedRequest()
    early.socket.message(JSON.stringify({ type: 'rpc_response_end', id: early.id }))
    await expect(early.promise).rejects.toThrow('response ended before its headers')

    for (const headers of [{ bad: 'value' }, { bad: ['ok', 1] }]) {
      const invalid = await startedRequest()
      invalid.socket.message(startFrame(invalid.id, headers as unknown as Record<string, string[]>))
      invalid.socket.message(JSON.stringify({ type: 'rpc_response_end', id: invalid.id }))
      await expect(invalid.promise).rejects.toThrow('response headers are invalid')
    }
  })

  it('ignores frames for unknown ids and rejects malformed binary response frames', async () => {
    const request = await startedRequest()
    request.socket.message(startFrame('unknown'))
    request.socket.message(binary('unknown', Uint8Array.of(1)))
    request.socket.message(JSON.stringify({ type: 'rpc_response_end', id: 'unknown' }))
    request.socket.message(Uint8Array.of(1, 2).buffer)
    await expect(request.promise).rejects.toThrow('binary frame is too short')

    for (const frame of [
      Uint8Array.of(0, 0, 1).buffer,
      Uint8Array.of(0, 129, 1).buffer,
      Uint8Array.of(0, 4, 1, 2, 3).buffer,
    ]) {
      const invalid = await startedRequest()
      invalid.socket.message(frame)
      await expect(invalid.promise).rejects.toThrow('binary frame transport id is invalid')
    }

    const unsupported = await startedRequest()
    unsupported.socket.message({ bytes: [] })
    await expect(unsupported.promise).rejects.toThrow('unsupported binary response frame')
  })

  it('rejects body-before-headers and aggregate response overflow', async () => {
    const early = await startedRequest()
    early.socket.message(binary(early.id, Uint8Array.of(1)))
    await expect(early.promise).rejects.toThrow('response body arrived before its headers')

    const transport = new WebSocketRpcTransport('/overflow')
    uuidState.value = 'overflow-id'
    const pending = await startedRequest(transport)
    pending.socket.message(startFrame(pending.id))
    await Promise.resolve()
    const state = (transport as unknown as { pending: Map<string, { bytes: number }> }).pending.get(pending.id)!
    state.bytes = 128 << 20
    pending.socket.message(binary(pending.id, Uint8Array.of(1)))
    await expect(pending.promise).rejects.toThrow('remote response exceeded the client limit')
  })

  it('covers protocol cleanup when close itself fails and the asynchronous decoder rejects a non-Error', async () => {
    const request = await startedRequest()
    request.socket.closeFailure = new Error('close failed')
    const blob = new Blob([])
    vi.spyOn(blob, 'arrayBuffer').mockRejectedValue('decode failed')
    request.socket.message(blob)
    await expect(request.promise).rejects.toThrow('decode failed')
    ;(new WebSocketRpcTransport('/rpc') as unknown as { finish(id: string): void }).finish('missing')
  })

  it('waits for buffered capacity and detects cancellation or close while waiting', async () => {
    vi.useFakeTimers()
    const transport = new WebSocketRpcTransport('/rpc')
    const wait = (transport as unknown as {
      waitForCapacity(socket: WebSocket, signal: AbortSignal | undefined): Promise<void>
    }).waitForCapacity.bind(transport)
    const socket = new FakeWebSocket('ws://localhost/rpc')
    socket.readyState = FakeWebSocket.OPEN
    socket.bufferedAmount = (4 << 20) + 1
    const capacity = wait(socket as unknown as WebSocket, undefined)
    socket.bufferedAmount = 0
    await vi.advanceTimersByTimeAsync(5)
    await expect(capacity).resolves.toBeUndefined()

    socket.bufferedAmount = (4 << 20) + 1
    const controller = new AbortController()
    const cancelled = wait(socket as unknown as WebSocket, controller.signal)
    const cancelledExpectation = expect(cancelled).rejects.toThrow('capacity cancelled')
    controller.abort(new Error('capacity cancelled'))
    await vi.advanceTimersByTimeAsync(5)
    await cancelledExpectation

    socket.bufferedAmount = (4 << 20) + 1
    socket.readyState = FakeWebSocket.CLOSED
    await expect(wait(socket as unknown as WebSocket, undefined)).rejects.toThrow('远程 WebSocket RPC 连接已断开')
  })
})
