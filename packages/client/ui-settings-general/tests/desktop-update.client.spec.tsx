// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { DesktopUpdateBadge } from '../src/client/DesktopUpdateBadge.tsx'
import { DesktopVersionLabel } from '../src/client/DesktopVersionLabel.tsx'
import { zh } from '../src/client/locales.ts'
import type { SettingsRootComponentProps } from '../src/client/shell-contract.ts'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_SNAPSHOT_KEY, DESKTOP_UPDATE_STATE_EVENT,
  desktopUpdateConfiguration, desktopUpdateSnapshot, type DesktopUpdateDownloadState,
} from '../src/client/desktop-update.ts'

const desktopSearch = '?dsh_desktop_version=1.0.0-beta.5&dsh_desktop_platform=darwin&dsh_desktop_arch=arm64&dsh_update_origin=https%3A%2F%2Fdsh.roubsite.com'
const desktopConfiguration = {
  version: '1.0.0-beta.5', platform: 'darwin', arch: 'arm64', portalOrigin: 'https://dsh.roubsite.com',
} as const
const t = ((key: keyof typeof zh, params?: Record<string, unknown>) => {
  let value = zh[key]
  for (const [name, replacement] of Object.entries(params ?? {})) {
    value = value.replaceAll(`{${name}}`, String(replacement))
  }
  return value
}) as SettingsRootComponentProps['t']

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  window.history.replaceState({}, '', '/')
  delete (window as unknown as { __dshDesktopUpdateSnapshot?: unknown }).__dshDesktopUpdateSnapshot
})

function setSnapshot(update: DesktopUpdateDownloadState): void {
  (window as unknown as Record<string, unknown>)[DESKTOP_UPDATE_SNAPSHOT_KEY] = {
    configuration: desktopConfiguration,
    update,
  }
}

describe('desktop update configuration', () => {
  it('accepts only complete desktop metadata and a safe portal origin', () => {
    expect(desktopUpdateConfiguration(desktopSearch)).toEqual({
      ...desktopConfiguration,
    })
    expect(desktopUpdateConfiguration('')).toBeUndefined()
    expect(desktopUpdateConfiguration(desktopSearch.replace('https%3A', 'http%3A'))).toBeUndefined()
  })

  it('validates the retained main-process snapshot', () => {
    expect(desktopUpdateSnapshot({
      configuration: desktopConfiguration,
      update: { status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' },
    })).toEqual({
      configuration: desktopConfiguration,
      update: { status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' },
    })
    expect(desktopUpdateSnapshot({
      configuration: { ...desktopConfiguration, portalOrigin: 'http://portal.example' },
      update: { status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' },
    })).toBeUndefined()
    expect(desktopUpdateSnapshot({
      configuration: desktopConfiguration,
      update: { status: 'downloading', version: '1.0.0-beta.6', fileName: 'package.dmg', received: 101, total: 100 },
    })).toBeUndefined()
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

  it('shows the current version when the desktop snapshot arrives after mounting', () => {
    render(<DesktopVersionLabel wide t={t} />)
    expect(screen.queryByText('v1.0.0-beta.5')).toBeNull()
    setSnapshot({ status: 'idle' })
    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: { status: 'idle' } }))
    })
    expect(screen.getByText('v1.0.0-beta.5')).toBeTruthy()
  })

  it('renders a retained update after route search parameters have been removed', () => {
    setSnapshot({ status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' })
    render(<DesktopUpdateBadge wide t={t} />)
    expect(screen.getByRole('link', { name: /有新版本/u })).toBeTruthy()
  })

  it('recovers when the main-process snapshot arrives after the component mounts', () => {
    render(<DesktopUpdateBadge wide t={t} />)
    expect(screen.queryByRole('link')).toBeNull()
    setSnapshot({ status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' })
    act(() => {
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: {
        status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg',
      } }))
    })
    expect(screen.getByRole('link', { name: /有新版本/u })).toBeTruthy()
  })

  it('does not enable update polling in an ordinary browser', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    render(<DesktopUpdateBadge wide t={t} />)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('shows desktop download progress and exposes an explicit cancel action', () => {
    setSnapshot({ status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg' })
    render(<DesktopUpdateBadge wide t={t} />)

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
      window.dispatchEvent(new CustomEvent(DESKTOP_UPDATE_STATE_EVENT, { detail: {
        status: 'available', version: '1.0.0-beta.6', fileName: 'package.dmg',
      } }))
    })
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('link', { name: /有新版本/u })).toBeTruthy()
  })
})
