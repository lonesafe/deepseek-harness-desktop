// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  SessionId, WorkspaceFileEntry, WorkspaceFileListing, WorkspaceFilePreview,
  WorkspaceId, WorkspaceListState, WorkspaceView,
} from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { WorkspaceFilesProps as ViewProps } from '../src/client/contract/slots.ts'
import { WorkspaceFilesView } from '../src/client/WorkspaceFilesView.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: ViewProps['t'] = makeTranslate(zh, commonZh)
const sessionId = 'session-files' as SessionId
const workspaceId = 'workspace-files' as WorkspaceId
const workspace: WorkspaceView = {
  workspaceId,
  path: '/projects/files',
  title: 'Files project',
  sessionIds: [sessionId],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const workspaceState = (items: readonly WorkspaceView[]): WorkspaceListState => ({
  items, archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  baselinesReady: true, recentWorkspaceId: items[0]?.workspaceId,
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

function mount(
  items: readonly WorkspaceView[] = [workspace],
  overrides: Partial<Pick<ViewProps, 'listFiles' | 'readFile'>> = {},
) {
  const listFiles = overrides.listFiles ?? vi.fn(async (_workspaceId: WorkspaceId, path: string) => listing(path))
  const readFile = overrides.readFile ?? vi.fn(async (_workspaceId: WorkspaceId, path: string) => ({
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

function file(name: string, size = 1): WorkspaceFileEntry {
  return {
    name, path: name, kind: 'file', hidden: false, size,
    modifiedAt: '2026-01-01T00:00:00.000Z',
  }
}

function preview(
  name: string,
  over: Partial<WorkspaceFilePreview>,
): WorkspaceFilePreview {
  return {
    path: name, name, mime: 'application/octet-stream', size: 1,
    modifiedAt: '2026-01-01T00:00:00.000Z', kind: 'binary', encoding: 'base64', content: 'AA==',
    ...over,
  }
}

describe('WorkspaceFilesView', () => {
  it('browses directories, hides dotfiles by default, and previews Markdown', async () => {
    const view = mount()
    expect(await screen.findByRole('button', { name: /README\.md/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /\.env/ })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '显示隐藏文件' }))
    expect(screen.getByRole('button', { name: /\.env/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '隐藏隐藏文件' }))
    expect(screen.queryByRole('button', { name: /\.env/ })).toBeNull()

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
    fireEvent.click(screen.getByRole('button', { name: '根目录' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: /README\.md/ })).toBeTruthy() })
  })

  it('renders text, image, PDF, unsupported previews, downloads, byte units, and truncation', async () => {
    const entries = [
      file('small.txt', 1_024), file('large.txt', 10_240),
      file('medium.bin', 1_048_576), file('huge.bin', 10_485_760),
      file('image.png'), file('paper.pdf'), file('oversized.dat'), file('unknown.dat'), file('.'),
    ]
    const previews = new Map<string, WorkspaceFilePreview>([
      ['small.txt', preview('small.txt', { mime: 'text/plain', kind: 'text', encoding: 'utf8', content: 'plain text', size: 1_024 })],
      ['image.png', preview('image.png', { mime: 'image/png', kind: 'image', encoding: 'base64', content: 'iVBORw==' })],
      ['paper.pdf', preview('paper.pdf', { mime: 'application/pdf', kind: 'pdf', encoding: 'base64', content: 'JVBERg==' })],
      ['oversized.dat', preview('oversized.dat', { kind: 'unsupported', encoding: 'none', content: '', reason: 'too-large' })],
      ['unknown.dat', preview('unknown.dat', { kind: 'unsupported', encoding: 'none', content: '' })],
      ['.', preview('.', { kind: 'image', encoding: 'none', content: '' })],
    ])
    const listFiles = vi.fn(async (): Promise<WorkspaceFileListing> => ({ path: '', entries, truncated: true }))
    const readFile = vi.fn(async (_workspaceId: WorkspaceId, path: string) => previews.get(path)!)
    mount([workspace], { listFiles, readFile })

    await screen.findByRole('button', { name: /small\.txt/ })
    expect(screen.getByText('1.0 KiB')).toBeTruthy()
    expect(screen.getByText('10 KiB')).toBeTruthy()
    expect(screen.getByText('1.0 MiB')).toBeTruthy()
    expect(screen.getByText('10 MiB')).toBeTruthy()
    expect(screen.getByText('此文件夹项目过多，仅显示前 1000 项。')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^\./ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /small\.txt/ }))
    expect(await screen.findByText('plain text')).toBeTruthy()
    expect(screen.getByRole('link', { name: '下载文件' }).getAttribute('href')).toContain('charset=utf-8')

    fireEvent.click(screen.getByRole('button', { name: /image\.png/ }))
    expect(await screen.findByRole('img', { name: 'image.png' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '下载文件' }).getAttribute('href')).toContain('base64,iVBORw==')

    fireEvent.click(screen.getByRole('button', { name: /paper\.pdf/ }))
    await waitFor(() => { expect(document.querySelector('object[aria-label="paper.pdf"]')).toBeTruthy() })

    fireEvent.click(screen.getByRole('button', { name: /oversized\.dat/ }))
    expect(await screen.findByText('文件超过 8 MiB 预览上限，请在设备本地打开。')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '下载文件' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /unknown\.dat/ }))
    expect(await screen.findByText('此文件格式暂不支持预览，可以下载后打开。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /^\./ }))
    expect(await screen.findByText('此文件格式暂不支持预览，可以下载后打开。')).toBeTruthy()
  })

  it('navigates nested breadcrumbs and marks only the current segment', async () => {
    const directory = (name: string, path: string): WorkspaceFileEntry => ({
      name, path, kind: 'directory', hidden: false, size: 0,
      modifiedAt: '2026-01-01T00:00:00.000Z',
    })
    const listFiles = vi.fn(async (_workspaceId: WorkspaceId, path: string): Promise<WorkspaceFileListing> => ({
      path,
      truncated: false,
      entries: path === '' ? [directory('docs', 'docs')]
        : path === 'docs' ? [directory('guides', 'docs/guides')] : [],
    }))
    mount([workspace], { listFiles })
    fireEvent.click(await screen.findByRole('button', { name: 'docs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'guides' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'guides' }).getAttribute('aria-current')).toBe('page') })
    expect(screen.getByRole('button', { name: 'docs' }).getAttribute('aria-current')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'docs' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: 'docs' }).getAttribute('aria-current')).toBe('page') })
  })

  it('reports Error and non-Error listing failures and refreshes explicitly', async () => {
    const listFiles = vi.fn()
      .mockRejectedValueOnce(new Error('directory offline'))
      .mockRejectedValueOnce('raw listing failure')
      .mockResolvedValueOnce({ path: '', entries: [], truncated: false })
    mount([workspace], { listFiles })
    expect(await screen.findByText('无法加载工作区文件：directory offline')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('无法加载工作区文件：raw listing failure')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByText('此文件夹为空。')).toBeTruthy()
  })

  it('aborts superseded listing and preview reads and reports remaining preview failures', async () => {
    const firstList = Promise.withResolvers<WorkspaceFileListing>()
    const rootListing: WorkspaceFileListing = {
      path: '', truncated: false, entries: [file('first.txt'), file('second.txt'), file('third.txt')],
    }
    const listFiles = vi.fn()
      .mockImplementationOnce((_workspaceId: WorkspaceId, _path: string, signal: AbortSignal) => {
        signal.addEventListener('abort', () => { firstList.reject(new Error('stale list')) }, { once: true })
        return firstList.promise
      })
      .mockResolvedValue(rootListing)
    const firstPreview = Promise.withResolvers<WorkspaceFilePreview>()
    const previewSignals: AbortSignal[] = []
    const rawPreviewFailure = {
      name: 'RawPreviewFailure', message: 'raw preview failure', toString: () => 'raw preview failure',
    }
    const typedRawPreviewFailure: Error = rawPreviewFailure
    const readFile = vi.fn((_workspaceId: WorkspaceId, path: string, signal: AbortSignal) => {
      previewSignals.push(signal)
      if (path === 'first.txt') return firstPreview.promise
      if (path === 'second.txt') return Promise.reject(new Error('preview offline'))
      return Promise.reject(typedRawPreviewFailure)
    })
    mount([workspace], { listFiles, readFile })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByRole('button', { name: /first\.txt/ })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /first\.txt/ }))
    fireEvent.click(screen.getByRole('button', { name: /second\.txt/ }))
    firstPreview.reject(new Error('stale preview'))
    expect(previewSignals[0]?.aborted).toBe(true)
    expect(await screen.findByText('无法加载工作区文件：preview offline')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /third\.txt/ }))
    expect(await screen.findByText('无法加载工作区文件：raw preview failure')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回文件列表' }))
    expect(await screen.findByText('选择一个文件进行预览。')).toBeTruthy()
  })

  it('aborts a pending preview when the view unmounts', async () => {
    const pending = Promise.withResolvers<WorkspaceFilePreview>()
    let readSignal: AbortSignal | undefined
    const readFile = vi.fn((_workspaceId: WorkspaceId, _path: string, signal: AbortSignal) => {
      readSignal = signal
      return pending.promise
    })
    const view = mount([workspace], { readFile })
    fireEvent.click(await screen.findByRole('button', { name: /README\.md/ }))
    view.unmount()
    expect(readSignal?.aborted).toBe(true)
  })

  it('shows an explicit unavailable state for an unregistered Session', () => {
    mount([])
    expect(screen.getByText('当前会话不属于已注册工作区。')).toBeTruthy()
  })
})
