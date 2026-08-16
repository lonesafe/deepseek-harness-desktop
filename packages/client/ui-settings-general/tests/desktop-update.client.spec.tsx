// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DesktopUpdateBadge } from '../src/client/DesktopUpdateBadge.tsx'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_STATE_EVENT, desktopUpdateConfiguration,
  fetchDesktopUpdate, UPDATE_CHECK_INTERVAL_MS,
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
})

describe('DesktopUpdateBadge', () => {
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
})
