import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocketRpcTransport } from '../src/client/websocket-rpc.ts'

type SocketData = string | ArrayBufferLike | Blob | ArrayBufferView

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readyState = FakeWebSocket.CONNECTING
  binaryType: BinaryType = 'blob'
  bufferedAmount = 0
  readonly sent: SocketData[] = []
  readonly closes: { code: number | undefined; reason: string | undefined }[] = []
  throwOnSend = false
  throwOnClose = false
  onSend: ((data: SocketData) => void) | undefined

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    sockets.push(this)
  }

  open(): void {
    this.readyState = FakeWebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  failOpen(): void {
    this.dispatchEvent(new Event('error'))
  }

  closeBeforeOpen(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }

  close(code?: number, reason?: string): void {
    if (this.throwOnClose) throw new Error('close failed')
    this.closes.push({ code, reason })
    this.readyState = FakeWebSocket.CLOSED
    queueMicrotask(() => { this.dispatchEvent(new Event('close')) })
  }

  send(data: SocketData): void {
    if (this.throwOnSend) throw new Error('send failed')
    this.sent.push(data)
    this.onSend?.(data)
  }

  receive(data: unknown): void {
    this.dispatchEvent(new MessageEvent('message', { data }))
  }
}

interface PendingProbe {
  bytes: number
  handleAbort(): void
}

interface TransportInternals {
  socket: WebSocket | undefined
  opening: Promise<WebSocket> | undefined
  pending: Map<string, PendingProbe>
  open(signal: AbortSignal | undefined): Promise<WebSocket>
  sendRequest(socket: WebSocket, id: string, path: string, payload: Uint8Array, signal: AbortSignal | undefined): Promise<void>
  waitForCapacity(socket: WebSocket, signal: AbortSignal | undefined): Promise<void>
  handleMessage(event: MessageEvent): Promise<void>
  finish(id: string): void
  failProtocol(error: unknown): void
  rejectAll(error: Error): void
}

const sockets: FakeWebSocket[] = []
const originalWebSocket = globalThis.WebSocket

function internals(transport: WebSocketRpcTransport): TransportInternals {
  return transport as unknown as TransportInternals
}

function transport(origin = 'https://remote.example'): WebSocketRpcTransport {
  vi.stubGlobal('location', { origin })
  vi.stubGlobal('WebSocket', FakeWebSocket)
  return new WebSocketRpcTransport('/api/rpc')
}

async function openedRequest(
  instance: WebSocketRpcTransport,
  body: unknown = { value: 1 },
  signal?: AbortSignal,
): Promise<{ pending: Promise<Response>; socket: FakeWebSocket; id: string }> {
  const pending = instance.request('/api/test', body, signal)
  await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
  const socket = sockets[0]!
  socket.open()
  await vi.waitFor(() => { expect(socket.sent.length).toBeGreaterThanOrEqual(2) })
  const start = JSON.parse(socket.sent[0] as string) as { id: string }
  return { pending, socket, id: start.id }
}

function binaryFrame(id: string, content: Uint8Array = Uint8Array.of(1)): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id)
  const frame = new Uint8Array(2 + idBytes.byteLength + content.byteLength)
  new DataView(frame.buffer).setUint16(0, idBytes.byteLength)
  frame.set(idBytes, 2)
  frame.set(content, 2 + idBytes.byteLength)
  return frame.buffer
}

async function settleMessages(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

afterEach(() => {
  sockets.length = 0
  vi.useRealTimers()
  vi.unstubAllGlobals()
  if (originalWebSocket === undefined) delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
  else globalThis.WebSocket = originalWebSocket
})

describe('WebSocketRpcTransport responses', () => {
  it('assembles Blob chunks, repeated headers, and ignores frames for completed or unknown ids', async () => {
    const instance = transport()
    const { pending, socket, id } = await openedRequest(instance)
    socket.receive(JSON.stringify({
      type: 'rpc_response_start', id, status: 201,
      headers: { 'x-value': ['one', 'two'] },
    }))
    socket.receive(new Blob([binaryFrame(id, new TextEncoder().encode('body'))]))
    socket.receive(JSON.stringify({ type: 'rpc_response_end', id }))
    const response = await pending
    expect(response.status).toBe(201)
    expect(response.headers.get('x-value')).toBe('one, two')
    expect(await response.text()).toBe('body')

    socket.receive(JSON.stringify({ type: 'rpc_response_start', id: 'unknown', status: 200 }))
    socket.receive(binaryFrame('unknown'))
    internals(instance).finish('unknown')
    await settleMessages()
    expect(socket.closes).toEqual([])
  })

  it('accepts omitted headers and maps an explicit remote error', async () => {
    const first = transport('http://remote.example')
    const opened = await openedRequest(first)
    expect(opened.socket.url).toBe('ws://remote.example/api/rpc')
    opened.socket.receive(JSON.stringify({ type: 'rpc_response_start', id: opened.id, status: 204 }))
    opened.socket.receive(JSON.stringify({ type: 'rpc_response_end', id: opened.id }))
    await expect(opened.pending).resolves.toMatchObject({ status: 204 })

    sockets.length = 0
    const second = transport()
    const errored = await openedRequest(second)
    errored.socket.receive(JSON.stringify({ type: 'rpc_error', id: errored.id, message: 'portal refused' }))
    await expect(errored.pending).rejects.toThrow('portal refused')
  })

  it.each([
    ['primitive control', JSON.stringify('bad'), 'control frame must be an object'],
    ['null control', 'null', 'control frame must be an object'],
    ['missing type', JSON.stringify({ id: 'x' }), 'missing type or id'],
    ['missing id', JSON.stringify({ type: 'rpc_response_end' }), 'missing type or id'],
    ['empty id', JSON.stringify({ type: 'rpc_response_end', id: '' }), 'missing type or id'],
    ['non-integer status', JSON.stringify({ type: 'rpc_response_start', id: 'x', status: 200.5 }), 'status is invalid'],
    ['low status', JSON.stringify({ type: 'rpc_response_start', id: 'x', status: 99 }), 'status is invalid'],
    ['high status', JSON.stringify({ type: 'rpc_response_start', id: 'x', status: 600 }), 'status is invalid'],
    ['primitive headers', JSON.stringify({ type: 'rpc_response_start', id: 'x', status: 200, headers: 1 }), 'headers are invalid'],
    ['null headers', JSON.stringify({ type: 'rpc_response_start', id: 'x', status: 200, headers: null }), 'headers are invalid'],
    ['invalid error message', JSON.stringify({ type: 'rpc_error', id: 'x', message: 1 }), 'error message is invalid'],
    ['unsupported type', JSON.stringify({ type: 'other', id: 'x' }), 'unsupported control frame'],
  ])('closes on a %s', async (_name, frame, message) => {
    const instance = transport()
    const opened = await openedRequest(instance)
    opened.socket.receive(frame)
    await expect(opened.pending).rejects.toThrow(message)
    expect(opened.socket.closes[0]).toEqual({ code: 1002, reason: 'invalid RPC frame' })
  })

  it.each([
    ['duplicate start', (socket: FakeWebSocket, id: string) => {
      socket.receive(JSON.stringify({ type: 'rpc_response_start', id, status: 200 }))
      socket.receive(JSON.stringify({ type: 'rpc_response_start', id, status: 200 }))
    }, 'started more than once'],
    ['end before start', (socket: FakeWebSocket, id: string) => {
      socket.receive(JSON.stringify({ type: 'rpc_response_end', id }))
    }, 'ended before its headers'],
    ['body before start', (socket: FakeWebSocket, id: string) => {
      socket.receive(binaryFrame(id))
    }, 'body arrived before its headers'],
    ['non-array response header', (socket: FakeWebSocket, id: string) => {
      socket.receive(JSON.stringify({ type: 'rpc_response_start', id, status: 200, headers: { bad: 'value' } }))
      socket.receive(JSON.stringify({ type: 'rpc_response_end', id }))
    }, 'headers are invalid'],
    ['non-string response header', (socket: FakeWebSocket, id: string) => {
      socket.receive(JSON.stringify({ type: 'rpc_response_start', id, status: 200, headers: { bad: [1] } }))
      socket.receive(JSON.stringify({ type: 'rpc_response_end', id }))
    }, 'headers are invalid'],
  ] as const)('rejects %s ordering', async (_name, drive, message) => {
    const instance = transport()
    const opened = await openedRequest(instance)
    drive(opened.socket, opened.id)
    await expect(opened.pending).rejects.toThrow(message)
  })

  it.each([
    ['too short', new ArrayBuffer(2), 'too short'],
    ['zero id', new ArrayBuffer(3), 'transport id is invalid'],
    ['oversized id', (() => { const value = new ArrayBuffer(131); new DataView(value).setUint16(0, 129); return value })(), 'transport id is invalid'],
    ['truncated id', (() => { const value = new ArrayBuffer(3); new DataView(value).setUint16(0, 2); return value })(), 'transport id is invalid'],
    ['invalid utf8 id', (() => { const value = new Uint8Array([0, 1, 0xff]); return value.buffer })(), 'encoded data was not valid'],
  ])('rejects a %s binary frame', async (_name, frame, message) => {
    const instance = transport()
    const opened = await openedRequest(instance)
    opened.socket.receive(frame)
    await expect(opened.pending).rejects.toThrow(message)
  })

  it('rejects unsupported binary values and responses over the aggregate limit', async () => {
    const first = transport()
    const unsupported = await openedRequest(first)
    unsupported.socket.receive(Uint8Array.of(1, 2, 3))
    await expect(unsupported.pending).rejects.toThrow('unsupported binary response frame')

    sockets.length = 0
    const second = transport()
    const oversized = await openedRequest(second)
    oversized.socket.receive(JSON.stringify({ type: 'rpc_response_start', id: oversized.id, status: 200 }))
    internals(second).pending.get(oversized.id)!.bytes = 128 << 20
    oversized.socket.receive(binaryFrame(oversized.id))
    await expect(oversized.pending).rejects.toThrow('exceeded the client limit')
  })
})

describe('WebSocketRpcTransport requests and connection lifecycle', () => {
  it('rejects pre-aborted Error and non-Error signals before opening a socket', async () => {
    const instance = transport()
    const withError = new AbortController()
    withError.abort(new Error('already closed'))
    await expect(instance.request('/api/test', {}, withError.signal)).rejects.toThrow('already closed')
    const withoutError = new AbortController()
    withoutError.abort('closed')
    await expect(instance.request('/api/test', {}, withoutError.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(sockets).toHaveLength(0)
  })

  it('rejects oversized requests and emits no socket', async () => {
    const instance = transport()
    const content = 'x'.repeat((24 << 20) + 1)
    await expect(instance.request('/api/test', { content }, undefined)).rejects.toThrow('远程请求内容过大')
    expect(sockets).toHaveLength(0)
  })

  it('coalesces opening callers, reuses the open socket, and supports an empty payload', async () => {
    const instance = transport()
    const first = instance.request('/api/one', { one: 1 }, undefined)
    const second = instance.request('/api/two', { two: 2 }, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    const socket = sockets[0]!
    socket.open()
    await vi.waitFor(() => { expect(socket.sent.filter(value => typeof value === 'string')).toHaveLength(4) })
    const starts = socket.sent.filter((value): value is string => typeof value === 'string')
      .map(value => JSON.parse(value) as { type: string; id: string })
      .filter(value => value.type === 'rpc_request_start')
    for (const start of starts) {
      socket.receive(JSON.stringify({ type: 'rpc_response_start', id: start.id, status: 200 }))
      socket.receive(JSON.stringify({ type: 'rpc_response_end', id: start.id }))
    }
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)

    const empty = instance.request('/api/empty', undefined, undefined)
    await vi.waitFor(() => { expect(socket.sent.filter(value => typeof value === 'string').length).toBeGreaterThanOrEqual(6) })
    const emptyStart = socket.sent.filter((value): value is string => typeof value === 'string')
      .map(value => JSON.parse(value) as { type: string; id: string; bytes?: number })
      .findLast(value => value.type === 'rpc_request_start')!
    expect(emptyStart.bytes).toBe(0)
    socket.receive(JSON.stringify({ type: 'rpc_response_start', id: emptyStart.id, status: 200 }))
    socket.receive(JSON.stringify({ type: 'rpc_response_end', id: emptyStart.id }))
    await expect(empty).resolves.toBeInstanceOf(Response)
  })

  it('maps socket error and pre-open close, including signal-aware opening rejection', async () => {
    const first = transport()
    const failed = first.request('/api/test', {}, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    sockets[0]!.failOpen()
    await expect(failed).rejects.toThrow('连接失败')

    sockets.length = 0
    const second = transport()
    const closed = second.request('/api/test', {}, new AbortController().signal)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    sockets[0]!.closeBeforeOpen()
    await expect(closed).rejects.toThrow('连接已断开')

    const raw = transport()
    const rawOpeningFailure = {
      name: 'RawOpeningFailure', message: 'raw opening failure', toString: () => 'raw opening failure',
    }
    const typedRawOpeningFailure: Error = rawOpeningFailure
    internals(raw).opening = Promise.reject(typedRawOpeningFailure)
    await expect(internals(raw).open(new AbortController().signal)).rejects.toThrow('raw opening failure')
  })

  it('rejects an abort during opening and after a reused socket is selected', async () => {
    const first = transport()
    const openingAbort = new AbortController()
    const opening = first.request('/api/test', {}, openingAbort.signal)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    openingAbort.abort(new Error('opening cancelled'))
    await expect(opening).rejects.toThrow('opening cancelled')
    sockets[0]!.open()

    sockets.length = 0
    const second = transport()
    const established = await openedRequest(second)
    established.socket.receive(JSON.stringify({ type: 'rpc_response_start', id: established.id, status: 200 }))
    established.socket.receive(JSON.stringify({ type: 'rpc_response_end', id: established.id }))
    await established.pending
    const selectedAbort = new AbortController()
    const selected = second.request('/api/test', {}, selectedAbort.signal)
    selectedAbort.abort(new Error('selected socket cancelled'))
    await expect(selected).rejects.toThrow('selected socket cancelled')
  })

  it('cancels pending work with open, closing, and throwing sockets', async () => {
    for (const mode of ['open', 'closing', 'throwing'] as const) {
      sockets.length = 0
      const instance = transport()
      const abort = new AbortController()
      const opened = await openedRequest(instance, {}, abort.signal)
      if (mode === 'closing') opened.socket.readyState = FakeWebSocket.CLOSING
      if (mode === 'throwing') opened.socket.throwOnSend = true
      abort.abort(new Error(`${mode} abort`))
      await expect(opened.pending).rejects.toThrow(`${mode} abort`)
      const cancels = opened.socket.sent.filter(value => typeof value === 'string')
        .map(value => JSON.parse(value) as { type: string })
        .filter(value => value.type === 'rpc_cancel')
      expect(cancels).toHaveLength(mode === 'open' ? 1 : 0)
    }
  })

  it('covers idempotent abort and the signal-less defensive abort reason', async () => {
    const instance = transport()
    const opened = await openedRequest(instance)
    const probe = internals(instance).pending.get(opened.id)!
    probe.handleAbort()
    probe.handleAbort()
    await expect(opened.pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects every pending request when an established socket closes', async () => {
    const instance = transport()
    const first = instance.request('/api/one', {}, undefined)
    const second = instance.request('/api/two', {}, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    const socket = sockets[0]!
    socket.open()
    await vi.waitFor(() => { expect(internals(instance).pending.size).toBe(2) })
    socket.closeBeforeOpen()
    await expect(first).rejects.toThrow('连接已断开')
    await expect(second).rejects.toThrow('连接已断开')

    const old = socket
    internals(instance).socket = new FakeWebSocket('ws://replacement') as unknown as WebSocket
    old.dispatchEvent(new Event('close'))
    await settleMessages()
  })
})

describe('WebSocketRpcTransport send and defensive internals', () => {
  it('chunks large requests and observes abort before the next chunk', async () => {
    const instance = transport()
    const abort = new AbortController()
    const pending = instance.request('/api/large', { content: 'x'.repeat((512 << 10) + 10) }, abort.signal)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    const socket = sockets[0]!
    socket.onSend = (data) => { if (data instanceof ArrayBuffer) abort.abort(new Error('between chunks')) }
    socket.open()
    await expect(pending).rejects.toThrow('between chunks')
  })

  it('rejects a socket that closes before the body and wraps a non-Error send failure', async () => {
    const closed = transport()
    const closing = closed.request('/api/test', {}, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    const socket = sockets[0]!
    socket.onSend = (data) => { if (typeof data === 'string') socket.readyState = FakeWebSocket.CLOSED }
    socket.open()
    await expect(closing).rejects.toThrow('连接已断开')

    sockets.length = 0
    const raw = transport()
    const inside = internals(raw)
    const rawSendFailure = {
      name: 'RawSendFailure', message: 'raw send failure', toString: () => 'raw send failure',
    }
    const typedRawSendFailure: Error = rawSendFailure
    inside.sendRequest = () => Promise.reject(typedRawSendFailure)
    const pending = raw.request('/api/test', {}, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    sockets[0]!.open()
    await expect(pending).rejects.toThrow('raw send failure')
  })

  it('ignores a late send failure after the response already settled', async () => {
    const instance = transport()
    const inside = internals(instance)
    const send = Promise.withResolvers<undefined>()
    inside.sendRequest = () => send.promise
    const pending = instance.request('/api/test', {}, undefined)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    const socket = sockets[0]!
    socket.open()
    await vi.waitFor(() => { expect(inside.pending.size).toBe(1) })
    const id = [...inside.pending.keys()][0]!
    socket.receive(JSON.stringify({ type: 'rpc_response_start', id, status: 200 }))
    socket.receive(JSON.stringify({ type: 'rpc_response_end', id }))
    await pending
    send.reject(new Error('late send failure'))
    await settleMessages()
  })

  it('waits for capacity, then detects abort and close while backpressured', async () => {
    vi.useFakeTimers()
    const instance = transport()
    const inside = internals(instance)
    const socket = new FakeWebSocket('ws://capacity')
    socket.readyState = FakeWebSocket.OPEN
    socket.bufferedAmount = (4 << 20) + 1

    const drained = inside.waitForCapacity(socket as unknown as WebSocket, undefined)
    socket.bufferedAmount = 0
    await vi.advanceTimersByTimeAsync(5)
    await expect(drained).resolves.toBeUndefined()

    socket.bufferedAmount = (4 << 20) + 1
    const abort = new AbortController()
    const aborted = inside.waitForCapacity(socket as unknown as WebSocket, abort.signal)
    const abortedAssertion = expect(aborted).rejects.toMatchObject({ name: 'AbortError' })
    abort.abort('backpressure cancelled')
    await vi.advanceTimersByTimeAsync(5)
    await abortedAssertion

    socket.bufferedAmount = (4 << 20) + 1
    socket.readyState = FakeWebSocket.OPEN
    const disconnected = inside.waitForCapacity(socket as unknown as WebSocket, undefined)
    const disconnectedAssertion = expect(disconnected).rejects.toThrow('连接已断开')
    socket.readyState = FakeWebSocket.CLOSED
    await vi.advanceTimersByTimeAsync(5)
    await disconnectedAssertion
  })

  it('rejects invalid outbound transport ids and survives a throwing protocol close', async () => {
    const instance = transport()
    const inside = internals(instance)
    const socket = new FakeWebSocket('ws://outbound')
    socket.readyState = FakeWebSocket.OPEN
    await expect(inside.sendRequest(socket as unknown as WebSocket, '', '/api/test', Uint8Array.of(1), undefined))
      .rejects.toThrow('transport id is invalid')
    await expect(inside.sendRequest(socket as unknown as WebSocket, 'x'.repeat(129), '/api/test', Uint8Array.of(1), undefined))
      .rejects.toThrow('transport id is invalid')

    inside.socket = socket as unknown as WebSocket
    socket.throwOnClose = true
    inside.failProtocol('raw protocol failure')
    inside.rejectAll(new Error('nothing pending'))
    expect(socket.closes).toEqual([])
  })

  it('directly observes an already-aborted private open and post-open abort guard', async () => {
    const instance = transport()
    const already = new AbortController()
    already.abort('private abort')
    const opening = internals(instance).open(already.signal)
    await vi.waitFor(() => { expect(sockets).toHaveLength(1) })
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    sockets[0]!.open()
  })
})
