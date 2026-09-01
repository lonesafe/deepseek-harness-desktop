// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { DesktopUpdateBadge } from '../src/client/DesktopUpdateBadge.tsx'
import { DesktopVersionLabel } from '../src/client/DesktopVersionLabel.tsx'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_STATE_EVENT, desktopUpdateConfiguration,
  desktopUpdateDownloadState, fetchDesktopUpdate, isDesktopRenderer, UPDATE_CHECK_INTERVAL_MS,
} from '../src/client/desktop-update.ts'
import { zh } from '../src/client/locales.ts'

const desktopSearch = '?dsh_desktop_version=1.0.0-beta.5&dsh_desktop_platform=darwin&dsh_desktop_arch=arm64&dsh_update_origin=https%3A%2F%2Fdsh.roubsite.com'
const t = makeTranslate(zh) as never

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
    expect(desktopUpdateConfiguration(desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'http%3A%2F%2Flocalhost%3A4567')))
      .toMatchObject({ portalOrigin: 'http://localhost:4567' })
    expect(isDesktopRenderer(desktopSearch)).toBe(true)
  })

  it.each([
    desktopSearch.replace('1.0.0-beta.5', 'not-a-version'),
    desktopSearch.replace('darwin', 'freebsd'),
    desktopSearch.replace('arm64', 'riscv64'),
    desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'not-a-url'),
    desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'https%3A%2F%2Fuser%40dsh.roubsite.com'),
    desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'https%3A%2F%2Fdsh.roubsite.com%2Fpath'),
    desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'https%3A%2F%2Fdsh.roubsite.com%2F%3Fquery%3D1'),
    desktopSearch.replace('https%3A%2F%2Fdsh.roubsite.com', 'https%3A%2F%2Fdsh.roubsite.com%2F%23fragment'),
  ])('rejects malformed desktop renderer metadata %#', (search) => {
    expect(desktopUpdateConfiguration(search)).toBeUndefined()
    expect(isDesktopRenderer(search)).toBe(false)
  })

  it('validates every desktop-owned download state', () => {
    expect(desktopUpdateDownloadState(null)).toBeUndefined()
    expect(desktopUpdateDownloadState({ status: 'idle' })).toEqual({ status: 'idle' })
    expect(desktopUpdateDownloadState({ status: 'checking' })).toEqual({ status: 'checking' })
    expect(desktopUpdateDownloadState({ status: 'cancelling' })).toEqual({ status: 'cancelling' })
    expect(desktopUpdateDownloadState({ status: 'other' })).toBeUndefined()
    for (const detail of [
      { status: 'downloading', version: 1, fileName: 'a', received: 0, total: 1 },
      { status: 'downloading', version: '1', fileName: 1, received: 0, total: 1 },
      { status: 'downloading', version: '1', fileName: 'a', received: 0.5, total: 1 },
      { status: 'downloading', version: '1', fileName: 'a', received: -1, total: 1 },
      { status: 'downloading', version: '1', fileName: 'a', received: 0, total: 0.5 },
      { status: 'downloading', version: '1', fileName: 'a', received: 0, total: 0 },
      { status: 'downloading', version: '1', fileName: 'a', received: 2, total: 1 },
    ]) expect(desktopUpdateDownloadState(detail)).toBeUndefined()
    expect(desktopUpdateDownloadState({
      status: 'verifying', version: '1', fileName: 'a', received: 1, total: 1,
    })).toEqual({ status: 'verifying', version: '1', fileName: 'a', received: 1, total: 1 })
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

  it('rejects portal failures and malformed release responses', async () => {
    const configuration = desktopUpdateConfiguration(desktopSearch)!
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ update_available: false }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ update_available: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ update_available: true, release: { version: 1, asset: {} } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ update_available: true, release: { version: '2', asset: { file_name: 1 } } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ update_available: true, release: { version: '2', asset: { file_name: 'a', download_url: 1 } } }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow('HTTP 503')
    await expect(fetchDesktopUpdate(configuration)).resolves.toBeUndefined()
    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow('invalid release')
    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow('invalid release')
    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow('invalid release')
    await expect(fetchDesktopUpdate(configuration)).rejects.toThrow('invalid release')
  })
})

describe('DesktopUpdateBadge', () => {
  it('shows the current version beside Settings only in the wide desktop sidebar', () => {
    window.history.replaceState({}, '', desktopSearch)
    const { rerender } = render(<DesktopVersionLabel wide t={t} />)
    expect(screen.getByText('v1.0.0-beta.5')).toBeTruthy()
    rerender(<DesktopVersionLabel wide={false} t={t} />)
    expect(screen.queryByText('v1.0.0-beta.5')).toBeNull()
    cleanup()
    window.history.replaceState({}, '', '/')
    render(<DesktopVersionLabel wide t={t} />)
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
    render(<DesktopUpdateBadge wide t={t} />)
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
    render(<DesktopUpdateBadge wide t={t} />)
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
    render(<DesktopUpdateBadge wide t={t} />)
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

  it('renders checking, verifying, cancelling, narrow, and byte-size states', async () => {
    window.history.replaceState({}, '', desktopSearch)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: { file_name: 'package.dmg', download_url: 'https://dsh.roubsite.com/downloads/a/package.dmg' },
      },
    }), { status: 200 })))
    const view = render(<DesktopUpdateBadge wide={false} t={t} />)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('link', { name: /有新版本/u }).textContent).toBe('↓')

    for (const detail of [
      { status: 'checking' },
      { status: 'verifying', version: '1.0.0-beta.6', fileName: 'package.dmg', received: 2_048, total: 4_096 },
      { status: 'cancelling', version: '1.0.0-beta.6', fileName: 'package.dmg', received: 2_097_152, total: 4_194_304 },
    ]) {
      act(() => {
        window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail }))
      })
      expect(screen.getByRole('status')).toBeTruthy()
    }
    expect(screen.getByText(/2\.0 MiB/u)).toBeTruthy()
    view.rerender(<DesktopUpdateBadge wide t={t} />)
    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { malformed: true } }))
    })
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('coalesces a slow check and ignores its result after disposal', async () => {
    vi.useFakeTimers()
    window.history.replaceState({}, '', desktopSearch)
    const response = Promise.withResolvers<Response>()
    const fetchMock = vi.fn(() => response.promise)
    vi.stubGlobal('fetch', fetchMock)
    const view = render(<DesktopUpdateBadge wide t={t} />)
    expect(fetchMock).toHaveBeenCalledOnce()
    await act(async () => { await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS) })
    expect(fetchMock).toHaveBeenCalledOnce()
    view.unmount()
    response.resolve(new Response(JSON.stringify({ update_available: false }), { status: 200 }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByRole('link')).toBeNull()
  })
})
