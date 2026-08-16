// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { DesktopRemoteAccessRow } from '../src/client/DesktopRemoteAccessRow.tsx'
import type { DesktopRemoteAccessRowProps } from '../src/client/DesktopRemoteAccessRow.tsx'

const desktopSearch = '?dsh_desktop_version=1.0.0-beta.5&dsh_desktop_platform=darwin&dsh_desktop_arch=arm64&dsh_update_origin=https%3A%2F%2Fdsh.roubsite.com'

const copy: Record<string, string> = {
  'remote.title': '远程控制',
  'remote.description': '登录官网并开启后，可从手机或其他设备安全连接这台电脑。',
  'remote.manage': '管理',
}

function props(): DesktopRemoteAccessRowProps {
  return { t: key => copy[key] ?? key } as DesktopRemoteAccessRowProps
}

afterEach(() => {
  cleanup()
  window.history.replaceState({}, '', '/')
})

describe('DesktopRemoteAccessRow', () => {
  it('renders an exact desktop action in General Settings', () => {
    window.history.replaceState({}, '', desktopSearch)
    render(<DesktopRemoteAccessRow {...props()} />)
    expect(screen.getByText('远程控制')).toBeTruthy()
    expect(screen.getByRole('link', { name: '管理' }).getAttribute('href')).toBe('dsh-remote://manage')
  })

  it('does not expose the desktop control in LAN or remote web clients', () => {
    render(<DesktopRemoteAccessRow {...props()} />)
    expect(screen.queryByRole('link')).toBeNull()
  })
})
