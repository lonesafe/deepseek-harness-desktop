// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DesktopUpdateBadge } from '../src/client/DesktopUpdateBadge.tsx'
import { DesktopVersionLabel } from '../src/client/DesktopVersionLabel.tsx'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_STATE_EVENT, desktopUpdateConfiguration,
  desktopUpdateDownloadState, fetchDesktopUpdate, isDesktopRenderer, UPDATE_CHECK_INTERVAL_MS,
} from '../src/client/desktop-update.ts'

const desktopSearch = '?dsh_desktop_version=1.0.0-beta.5&dsh_desktop_platform=darwin&dsh_desktop_arch=arm64&dsh_update_origin=https%3A%2F%2Fdsh.roubsite.com'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
})

describe('desktop update configuration', () => {
  it('accepts only complete desktop metadata and a safe portal origin', () => {
    expect(desktopUpdateConfiguration(desktopSearch)).toEqual({
      version: '1.0.0-beta.5', platform: 'darwin', arch: 'arm64', portalOrigin: 'https://dsh.roubsite.com',
    })
    expect(desktopUpdateConfiguration('')).toBeUndefined()
    expect(desktopUpdateConfiguration(desktopSearch.replace('https%3A', 'http%3A'))).toBeUndefined()
  })

  it('accepts every shipped platform/architecture and only a bare HTTPS or loopback HTTP origin', () => {
    const configured = (overrides: Record<string, string>) => {
      const params = new URLSearchParams(desktopSearch)
      for (const [name, value] of Object.entries(overrides)) params.set(name, value)
      return desktopUpdateConfiguration(`?${params.toString()}`)
    }
    expect(configured({ dsh_desktop_platform: 'win32', dsh_desktop_arch: 'x64' }))
      .toMatchObject({ platform: 'win32', arch: 'x64' })
    expect(configured({ dsh_desktop_platform: 'linux' })).toMatchObject({ platform: 'linux' })
    expect(configured({ dsh_update_origin: 'http://localhost:8080' })?.portalOrigin).toBe('http://localhost:8080')
    for (const origin of [
      'http://example.com', 'ftp://example.com', 'https://user:pass@example.com',
      'https://example.com/path', 'https://example.com/?query=1', 'https://example.com/#hash', 'not a URL',
    ]) {
      expect(configured({ dsh_update_origin: origin })).toBeUndefined()
    }
    expect(configured({ dsh_desktop_platform: 'freebsd' })).toBeUndefined()
    expect(configured({ dsh_desktop_arch: 'riscv64' })).toBeUndefined()
    expect(configured({ dsh_desktop_version: 'next' })).toBeUndefined()
    expect(isDesktopRenderer(desktopSearch)).toBe(true)
    expect(isDesktopRenderer('')).toBe(false)
  })

  it('validates every desktop-owned download state', () => {
    expect(desktopUpdateDownloadState({ status: 'idle' })).toEqual({ status: 'idle' })
    expect(desktopUpdateDownloadState({ status: 'checking' })).toEqual({ status: 'checking' })
    expect(desktopUpdateDownloadState({ status: 'cancelling' })).toEqual({ status: 'cancelling' })
    for (const status of ['downloading', 'verifying', 'cancelling'] as const) {
      expect(desktopUpdateDownloadState({
        status, version: '1.1.0', fileName: 'package', received: 1, total: 2,
      })).toEqual({ status, version: '1.1.0', fileName: 'package', received: 1, total: 2 })
    }
    for (const value of [
      null,
      { status: 'unknown' },
      { status: 'downloading', version: 1, fileName: 'p', received: 1, total: 2 },
      { status: 'downloading', version: '1', fileName: 1, received: 1, total: 2 },
      { status: 'downloading', version: '1', fileName: 'p', received: '1', total: 2 },
      { status: 'downloading', version: '1', fileName: 'p', received: Number.MAX_SAFE_INTEGER + 1, total: 2 },
      { status: 'downloading', version: '1', fileName: 'p', received: -1, total: 2 },
      { status: 'downloading', version: '1', fileName: 'p', received: 1, total: '2' },
      { status: 'downloading', version: '1', fileName: 'p', received: 1, total: Number.MAX_SAFE_INTEGER + 1 },
      { status: 'downloading', version: '1', fileName: 'p', received: 1, total: 0 },
      { status: 'downloading', version: '1', fileName: 'p', received: 3, total: 2 },
    ]) expect(desktopUpdateDownloadState(value)).toBeUndefined()
  })

  it('accepts only package links served by the configured portal', async () => {
    const configuration = desktopUpdateConfiguration(desktopSearch)!
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: {
          file_name: 'DeepSeek-Harness-1.0.0-beta.6-mac-arm64.dmg',
          download_url: 'https://dsh.roubsite.com/downloads/asset/package.dmg',
        },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))
    await expect(fetchDesktopUpdate(configuration)).resolves.toEqual({
      version: '1.0.0-beta.6',
      fileName: 'DeepSeek-Harness-1.0.0-beta.6-mac-arm64.dmg',
      downloadURL: 'https://dsh.roubsite.com/downloads/asset/package.dmg',
    })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      update_available: true,
      release: { version: '1.0.0-beta.6', asset: { file_name: 'package.dmg', download_url: 'https://github.com/example/package.dmg' } },
    }), { status: 200 })))
    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow(/configured portal/u)
  })

  it('rejects failed or malformed update responses and forwards cancellation', async () => {
    const configuration = desktopUpdateConfiguration(desktopSearch)!
    const abort = new AbortController()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ update_available: false }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchDesktopUpdate(configuration, abort.signal)).resolves.toBeUndefined()
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: abort.signal })

    for (const response of [
      new Response('', { status: 503 }),
      Response.json({ update_available: true, release: null }),
      Response.json({ update_available: true, release: { version: 1, asset: { file_name: 'p', download_url: 'https://dsh.roubsite.com/downloads/p' } } }),
      Response.json({ update_available: true, release: { version: '1', asset: null } }),
      Response.json({ update_available: true, release: { version: '1', asset: { file_name: 1, download_url: 'https://dsh.roubsite.com/downloads/p' } } }),
      Response.json({ update_available: true, release: { version: '1', asset: { file_name: 'p', download_url: 1 } } }),
      Response.json({ update_available: true, release: { version: '1', asset: { file_name: 'p', download_url: 'https://dsh.roubsite.com/releases/p' } } }),
    ]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
      await expect(fetchDesktopUpdate(configuration)).rejects.toThrow()
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(null)))
    await expect(fetchDesktopUpdate(configuration)).resolves.toBeUndefined()
  })
})

describe('DesktopUpdateBadge', () => {
  it('shows the current version beside Settings only in the wide desktop sidebar', () => {
    window.history.replaceState({}, '', desktopSearch)
    const { rerender } = render(<DesktopVersionLabel wide />)
    expect(screen.getByText('v1.0.0-beta.5')).toBeTruthy()
    rerender(<DesktopVersionLabel wide={false} />)
    expect(screen.queryByText('v1.0.0-beta.5')).toBeNull()
    cleanup()
    window.history.replaceState({}, '', '/')
    render(<DesktopVersionLabel wide />)
    expect(screen.queryByText('v1.0.0-beta.5')).toBeNull()
  })

  it('checks immediately, then exactly every 10 minutes, and renders beside Settings only for a new version', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', desktopSearch)
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: { file_name: 'package.dmg', download_url: 'https://dsh.roubsite.com/downloads/a/package.dmg' },
      },
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    render(<DesktopUpdateBadge wide />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('link', { name: /有新版本/u })).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(600_000)

    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not enable update polling in an ordinary browser', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<DesktopUpdateBadge wide />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows desktop download progress and exposes an explicit cancel action', async () => {
    window.history.replaceState({}, '', desktopSearch)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: { file_name: 'package.dmg', download_url: 'https://dsh.roubsite.com/downloads/a/package.dmg' },
      },
    }), { status: 200 })))
    render(<DesktopUpdateBadge wide />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: {
        status: 'downloading', version: '1.0.0-beta.6', fileName: 'package.dmg', received: 25, total: 100,
      } }))
    })

    expect(screen.getByRole('status').textContent).toContain('正在下载更新')
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('25')
    expect(screen.getByText('25%')).toBeTruthy()
    expect(screen.getByRole('link', { name: '取消更新下载' }).getAttribute('href')).toBe(DESKTOP_UPDATE_CANCEL_URL)

    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { status: 'idle' } }))
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('link', { name: /有新版本/u })).toBeTruthy()
  })

  it('renders checking, verification, cancellation, compact layout, and byte units', async () => {
    window.history.replaceState({}, '', desktopSearch)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: { file_name: 'package.dmg', download_url: 'https://dsh.roubsite.com/downloads/a/package.dmg' },
      },
    })))
    render(<DesktopUpdateBadge wide={false} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('link', { name: /有新版本/u }).textContent).toBe('↓')

    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { status: 'checking' } }))
    })
    expect(screen.getByRole('status').textContent).toContain('正在检查更新')
    expect(screen.queryByRole('progressbar')).toBeNull()

    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: {
        status: 'verifying', version: '1.0.0-beta.6', fileName: 'package.dmg', received: 1024, total: 2 * 1024 * 1024,
      } }))
    })
    expect(screen.getByRole('status').textContent).toContain('正在校验安装包')
    expect(screen.getByRole('status').textContent).toContain('1.0 KiB / 2.0 MiB')

    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { status: 'cancelling' } }))
    })
    expect(screen.getByRole('status').textContent).toContain('正在取消下载')
    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { status: 'bad' } }))
    })
    expect(screen.getByRole('status').textContent).toContain('正在取消下载')
  })

  it('deduplicates an in-flight poll, contains failures, and ignores completion after unmount', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', desktopSearch)
    const pending = Promise.withResolvers<Response>()
    const fetchMock = vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('offline'))
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<DesktopUpdateBadge wide />)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    view.unmount()
    pending.resolve(Response.json({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: { file_name: 'package.dmg', download_url: 'https://dsh.roubsite.com/downloads/a/package.dmg' },
      },
    }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })

    render(<DesktopUpdateBadge wide />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByRole('link')).toBeNull()
  })
})
