/** Multiplexed browser-to-portal WebSocket carrier for client-initiated JSON RPCs. */

import { randomUuid } from './random-uuid.ts'

const MAX_REQUEST_BYTES = 24 << 20
const MAX_RESPONSE_BYTES = 128 << 20
const CHUNK_BYTES = 512 << 10
const BUFFERED_AMOUNT_LIMIT = 4 << 20
const MAX_TRANSPORT_ID_BYTES = 128

interface ResponseStartFrame {
  type: 'rpc_response_start'
  id: string
  status: number
  headers: Record<string, string[]> | undefined
}

interface ResponseEndFrame {
  type: 'rpc_response_end'
  id: string
}

interface ErrorFrame {
  type: 'rpc_error'
  id: string
  message: string
}

interface PendingResponse {
  readonly resolve: (response: Response) => void
  readonly reject: (reason?: unknown) => void
  readonly signal: AbortSignal | undefined
  readonly handleAbort: () => void
  status?: number
  headers: Record<string, string[]> | undefined
  chunks: ArrayBuffer[]
  bytes: number
}

type ServerControlFrame = ResponseStartFrame | ResponseEndFrame | ErrorFrame

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason
  return reason instanceof Error ? reason : new DOMException('The operation was aborted', 'AbortError')
}

function parseServerControl(value: unknown): ServerControlFrame {
  if (typeof value !== 'object' || value === null) throw new Error('control frame must be an object')
  const frame = value as Record<string, unknown>
  if (typeof frame.type !== 'string' || typeof frame.id !== 'string' || frame.id.length === 0) {
    throw new Error('control frame is missing type or id')
  }
  if (frame.type === 'rpc_response_start') {
    if (!Number.isInteger(frame.status) || (frame.status as number) < 100 || (frame.status as number) > 599) {
      throw new Error('response status is invalid')
    }
    if (frame.headers !== undefined && (typeof frame.headers !== 'object' || frame.headers === null)) {
      throw new Error('response headers are invalid')
    }
    return frame as unknown as ResponseStartFrame
  }
  if (frame.type === 'rpc_response_end') return frame as unknown as ResponseEndFrame
  if (frame.type === 'rpc_error') {
    if (typeof frame.message !== 'string') throw new Error('error message is invalid')
    return frame as unknown as ErrorFrame
  }
  throw new Error(`unsupported control frame ${frame.type}`)
}

function encodeBinaryChunk(id: string, chunk: Uint8Array): ArrayBuffer {
  const idBytes = new TextEncoder().encode(id)
  if (idBytes.byteLength === 0 || idBytes.byteLength > MAX_TRANSPORT_ID_BYTES) {
    throw new Error('transport id is invalid')
  }
  const frame = new Uint8Array(2 + idBytes.byteLength + chunk.byteLength)
  new DataView(frame.buffer).setUint16(0, idBytes.byteLength)
  frame.set(idBytes, 2)
  frame.set(chunk, 2 + idBytes.byteLength)
  return frame.buffer
}

function decodeBinaryChunk(value: ArrayBuffer): { id: string; chunk: Uint8Array } {
  const bytes = new Uint8Array(value)
  if (bytes.byteLength < 3) throw new Error('binary frame is too short')
  const idLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(0)
  if (idLength === 0 || idLength > MAX_TRANSPORT_ID_BYTES || bytes.byteLength < 2 + idLength) {
    throw new Error('binary frame transport id is invalid')
  }
  const id = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(2, 2 + idLength))
  return { id, chunk: bytes.slice(2 + idLength) }
}

/** Page-lifetime, multiplexed WebSocket carrier selected only by the remote portal shell. */
export class WebSocketRpcTransport {
  private socket: WebSocket | undefined
  private opening: Promise<WebSocket> | undefined
  private readonly pending = new Map<string, PendingResponse>()
  private receiveQueue = Promise.resolve()

  /** @param path - Same-origin WebSocket path injected by the trusted portal shell. */
  constructor(private readonly path: string) {}

  /**
   * Send one complete JSON message and resolve with a fetch-compatible response.
   * Cancellation emits `rpc_cancel`; a socket or protocol failure rejects every affected request.
   * @param path - Same-origin logical API path for the portal to translate.
   * @param body - Complete client-initiated logical message.
   * @param signal - Caller and base-client deadline cancellation, when present.
   * @returns The correlated response after its bounded binary chunks have been assembled.
   */
  async request(path: string, body: unknown, signal: AbortSignal | undefined): Promise<Response> {
    if (signal !== undefined && signal.aborted) throw abortReason(signal)
    const payload = new TextEncoder().encode(JSON.stringify(body))
    if (payload.byteLength > MAX_REQUEST_BYTES) throw new Error('远程请求内容过大')
    const socket = await this.open(signal)
    if (signal !== undefined && signal.aborted) throw abortReason(signal)
    const id = randomUuid()

    return new Promise<Response>((resolve, reject) => {
      const handleAbort = (): void => {
        if (!this.pending.delete(id)) return
        try {
          if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'rpc_cancel', id }))
        } catch {}
        reject(signal === undefined ? new DOMException('The operation was aborted', 'AbortError') : abortReason(signal))
      }
      const pending: PendingResponse = { resolve, reject, signal, handleAbort, headers: undefined, chunks: [], bytes: 0 }
      this.pending.set(id, pending)
      signal?.addEventListener('abort', handleAbort, { once: true })
      void this.sendRequest(socket, id, path, payload, signal).catch((error: unknown) => {
        if (!this.pending.delete(id)) return
        signal?.removeEventListener('abort', handleAbort)
        reject(error instanceof Error ? error : new Error(String(error)))
      })
    })
  }

  private open(signal: AbortSignal | undefined): Promise<WebSocket> {
    const current = this.socket
    if (current?.readyState === WebSocket.OPEN) return Promise.resolve(current)
    if (this.opening === undefined) {
      const url = new URL(this.path, globalThis.location.origin)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(url)
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      this.opening = new Promise<WebSocket>((resolve, reject) => {
        const handleOpen = (): void => {
          socket.removeEventListener('error', handleError)
          socket.removeEventListener('close', handleClose)
          this.opening = undefined
          resolve(socket)
        }
        const handleError = (): void => {
          socket.removeEventListener('open', handleOpen)
          socket.removeEventListener('close', handleClose)
          this.opening = undefined
          reject(new Error('远程 WebSocket RPC 连接失败'))
        }
        const handleClose = (): void => {
          socket.removeEventListener('open', handleOpen)
          socket.removeEventListener('error', handleError)
          this.opening = undefined
          reject(new Error('远程 WebSocket RPC 连接已断开'))
        }
        socket.addEventListener('open', handleOpen, { once: true })
        socket.addEventListener('error', handleError, { once: true })
        socket.addEventListener('close', handleClose, { once: true })
      })
      socket.addEventListener('message', (event) => {
        this.receiveQueue = this.receiveQueue
          .then(async () => { await this.handleMessage(event) })
          .catch((error: unknown) => { this.failProtocol(error) })
      })
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = undefined
        this.opening = undefined
        this.rejectAll(new Error('远程 WebSocket RPC 连接已断开'))
      })
    }
    const opening: Promise<WebSocket> = this.opening
    if (signal === undefined) return opening
    return new Promise<WebSocket>((resolve, reject) => {
      const handleAbort = (): void => { reject(abortReason(signal)) }
      signal.addEventListener('abort', handleAbort, { once: true })
      opening.then(
        (socket) => { signal.removeEventListener('abort', handleAbort); resolve(socket) },
        (error: unknown) => {
          signal.removeEventListener('abort', handleAbort)
          reject(error instanceof Error ? error : new Error(String(error)))
        },
      )
      if (signal.aborted) handleAbort()
    })
  }

  private async sendRequest(
    socket: WebSocket,
    id: string,
    path: string,
    payload: Uint8Array,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    socket.send(JSON.stringify({ type: 'rpc_request_start', id, path, bytes: payload.byteLength }))
    for (let offset = 0; offset < payload.byteLength; offset += CHUNK_BYTES) {
      if (signal !== undefined && signal.aborted) throw abortReason(signal)
      if (socket.readyState !== WebSocket.OPEN) throw new Error('远程 WebSocket RPC 连接已断开')
      await this.waitForCapacity(socket, signal)
      socket.send(encodeBinaryChunk(id, payload.subarray(offset, Math.min(offset + CHUNK_BYTES, payload.byteLength))))
    }
    socket.send(JSON.stringify({ type: 'rpc_request_end', id }))
  }

  private async waitForCapacity(socket: WebSocket, signal: AbortSignal | undefined): Promise<void> {
    while (socket.bufferedAmount > BUFFERED_AMOUNT_LIMIT) {
      if (signal?.aborted === true) throw abortReason(signal)
      if (socket.readyState !== WebSocket.OPEN) throw new Error('远程 WebSocket RPC 连接已断开')
      await new Promise<void>((resolve) => { setTimeout(resolve, 5) })
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    if (typeof event.data === 'string') {
      const frame = parseServerControl(JSON.parse(event.data))
      const pending = this.pending.get(frame.id)
      if (pending === undefined) return
      if (frame.type === 'rpc_response_start') {
        if (pending.status !== undefined) throw new Error('response started more than once')
        pending.status = frame.status
        pending.headers = frame.headers
        return
      }
      if (frame.type === 'rpc_error') {
        this.finish(frame.id)
        pending.reject(new Error(frame.message))
        return
      }
      if (pending.status === undefined) throw new Error('response ended before its headers')
      const headers = new Headers()
      for (const [name, values] of Object.entries(pending.headers ?? {})) {
        if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) {
          throw new Error('response headers are invalid')
        }
        for (const value of values) headers.append(name, value)
      }
      this.finish(frame.id)
      pending.resolve(new Response(new Blob(pending.chunks), { status: pending.status, headers }))
      return
    }
    const rawData: unknown = event.data
    const data = rawData instanceof Blob ? await rawData.arrayBuffer() : rawData
    if (!(data instanceof ArrayBuffer)) throw new Error('unsupported binary response frame')
    const { id, chunk } = decodeBinaryChunk(data)
    const pending = this.pending.get(id)
    if (pending === undefined) return
    if (pending.status === undefined) throw new Error('response body arrived before its headers')
    pending.bytes += chunk.byteLength
    if (pending.bytes > MAX_RESPONSE_BYTES) throw new Error('remote response exceeded the client limit')
    pending.chunks.push(chunk.slice().buffer)
  }

  private finish(id: string): void {
    const pending = this.pending.get(id)
    if (pending === undefined) return
    this.pending.delete(id)
    pending.signal?.removeEventListener('abort', pending.handleAbort)
  }

  private failProtocol(error: unknown): void {
    try { this.socket?.close(1002, 'invalid RPC frame') } catch {}
    this.rejectAll(error instanceof Error ? error : new Error(String(error)))
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      this.finish(id)
      pending.reject(error)
    }
  }
}
