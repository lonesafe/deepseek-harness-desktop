/** Legacy desktop-portal selection and its generic fetch adapter. */

import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RpcFetch } from '../src/client/rpc.ts'

afterEach(() => {
  vi.doUnmock('../src/client/rpc.ts')
  vi.doUnmock('../src/client/websocket-rpc.ts')
  vi.resetModules()
  delete (globalThis as { __DSH_REMOTE_RPC__?: unknown }).__DSH_REMOTE_RPC__
  delete (globalThis as { location?: unknown }).location
})

describe('legacy desktop remote portal', () => {
  it('adapts JSON POSTs to the multiplexed socket and rejects other fetch inputs', async () => {
    let selectedFetch: RpcFetch | undefined
    const request = vi.fn(() => Promise.resolve(new Response('ok')))
    vi.doMock('../src/client/rpc.ts', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../src/client/rpc.ts')>()
      return {
        ...actual,
        createWebConnectionRpc(fetch?: RpcFetch) {
          selectedFetch = fetch
          return { call: vi.fn() }
        },
      }
    })
    vi.doMock('../src/client/websocket-rpc.ts', () => ({
      WebSocketRpcTransport: class {
        request = request
      },
    }))
    ;(globalThis as { location?: unknown }).location = {
      hostname: 'portal.example', search: '', origin: 'https://portal.example',
    }
    ;(globalThis as { __DSH_REMOTE_RPC__?: unknown }).__DSH_REMOTE_RPC__ = '/api/rpc'
    const { apply } = await import('../src/client/index.ts')
    apply(new Context())
    if (selectedFetch === undefined) throw new Error('legacy portal transport was not selected')
    const url = new URL('https://portal.example/api/settings/describe')

    await expect(selectedFetch(url, { method: 'GET' })).rejects.toThrow('requires a JSON POST body')
    await expect(selectedFetch(url, { method: 'POST', body: new Uint8Array() })).rejects.toThrow('requires a JSON POST body')
    const invalid = selectedFetch(url, { method: 'POST', body: '{' })
    const rejection: unknown = await invalid.then(() => undefined, (reason: unknown) => reason)
    expect(rejection).toBeInstanceOf(Error)
    expect((rejection as Error).message).toBe('remote portal RPC body is not valid JSON')
    expect((rejection as Error).cause).toBeInstanceOf(SyntaxError)
    const controller = new AbortController()
    await expect(selectedFetch(url, {
      method: 'POST', body: '{"method":"settings/describe"}', signal: controller.signal,
    })).resolves.toBeInstanceOf(Response)
    expect(request).toHaveBeenCalledWith(
      '/api/settings/describe', { method: 'settings/describe' }, controller.signal,
    )
    await expect(selectedFetch(url, {
      method: 'POST', body: '{"method":"settings/list"}',
    })).resolves.toBeInstanceOf(Response)
    expect(request).toHaveBeenLastCalledWith(
      '/api/settings/describe', { method: 'settings/list' }, undefined,
    )
  })
})
