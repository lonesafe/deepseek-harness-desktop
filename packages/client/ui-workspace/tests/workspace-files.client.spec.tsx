// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  WorkspaceFileListing, WorkspaceId, WorkspaceSnapshot, WorkspaceView,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { WorkspaceFilesProps as ViewProps } from '../src/client/contract/slots.ts'
import { WorkspaceFilesView } from '../src/client/WorkspaceFilesView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ViewProps['t'] = makeTranslate(zh, commonZh)
const sessionId = SessionId('session-files')
const workspaceId = 'workspace-files' as WorkspaceId
const workspace: WorkspaceView = {
  workspaceId,
  path: '/projects/files',
  title: 'Files project',
  sessionIds: [sessionId],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceSnapshot => ({
  items, archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
})
function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

function listing(path: string): WorkspaceFileListing {
  return path === ''
    ? {
      path,
      truncated: false,
      entries: [
        { name: 'docs', path: 'docs', kind: 'directory', hidden: false, size: 0, modifiedAt: '2026-01-01T00:00:00.000Z' },
        { name: '.env', path: '.env', kind: 'file', hidden: true, size: 6, modifiedAt: '2026-01-01T00:00:00.000Z' },
        { name: 'README.md', path: 'README.md', kind: 'file', hidden: false, size: 10, modifiedAt: '2026-01-01T00:00:00.000Z' },
      ],
    }
    : { path, truncated: false, entries: [] }
}

function mount(items: readonly WorkspaceView[] = [workspace]) {
  const listFiles = vi.fn(async (_workspaceId: WorkspaceId, path: string) => listing(path))
  const readFile = vi.fn(async (_workspaceId: WorkspaceId, path: string) => ({
    path, name: path, mime: 'text/markdown', size: 10,
    modifiedAt: '2026-01-01T00:00:00.000Z', kind: 'markdown' as const,
    encoding: 'utf8' as const, content: '# Project files',
  }))
  const props = {
    sessionId,
    useWorkspaces: hook(workspaceState(items)),
    listFiles,
    readFile,
    t,
  } as unknown as ViewProps
  return { ...render(<WorkspaceFilesView {...props} />), listFiles, readFile }
}

describe('WorkspaceFilesView', () => {
  it('browses directories, hides dotfiles by default, and previews Markdown', async () => {
    const view = mount()
    expect(await screen.findByRole('button', { name: /README\.md/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /\.env/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '显示隐藏文件' }))
    expect(screen.getByRole('button', { name: /\.env/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /README\.md/ }))
    expect(await screen.findByRole('heading', { name: 'Project files' })).toBeTruthy()
    expect(view.readFile).toHaveBeenCalledWith(workspaceId, 'README.md', expect.any(AbortSignal))

    fireEvent.click(screen.getByRole('button', { name: '源码' }))
    expect(screen.queryByRole('heading', { name: 'Project files' })).toBeNull()
    expect(screen.getByText('# Project files')).toBeTruthy()
    expect(screen.getByRole('button', { name: '源码' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: '预览' }))
    expect(screen.getByRole('heading', { name: 'Project files' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '预览' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(screen.getByRole('button', { name: 'docs' }))
    await waitFor(() => {
      expect(view.listFiles).toHaveBeenCalledWith(workspaceId, 'docs', expect.any(AbortSignal))
    })
    expect(screen.getByRole('button', { name: 'docs' }).getAttribute('aria-current')).toBe('page')
  })

  it('shows an explicit unavailable state for an unregistered Session', () => {
    mount([])
    expect(screen.getByText('当前会话不属于已注册工作区。')).toBeTruthy()
  })
})
