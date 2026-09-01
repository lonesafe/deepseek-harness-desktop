// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type {
  WorkspaceFileListing, WorkspaceFilePreview, WorkspaceId, WorkspaceSnapshot, WorkspaceView,
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

interface MountOptions {
  listFiles?: (workspaceId: WorkspaceId, path: string, signal: AbortSignal) => Promise<WorkspaceFileListing>
  readFile?: (workspaceId: WorkspaceId, path: string, signal: AbortSignal) => Promise<WorkspaceFilePreview>
}

function mount(items: readonly WorkspaceView[] = [workspace], options: MountOptions = {}) {
  const listFiles = vi.fn(options.listFiles ?? (async (_workspaceId: WorkspaceId, path: string) => listing(path)))
  const readFile = vi.fn(options.readFile ?? (async (_workspaceId: WorkspaceId, path: string) => ({
    path, name: path, mime: 'text/markdown', size: 10,
    modifiedAt: '2026-01-01T00:00:00.000Z', kind: 'markdown' as const,
    encoding: 'utf8' as const, content: '# Project files',
  })))
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

  it('navigates nested breadcrumbs and labels a file with an empty suffix', async () => {
    mount([workspace], {
      listFiles: async (_id, path) => ({
        path,
        truncated: false,
        entries: path === ''
          ? [
            { name: 'docs', path: 'docs', kind: 'directory', hidden: false, size: 0, modifiedAt: workspace.createdAt },
            { name: 'trailing.', path: 'trailing.', kind: 'file', hidden: false, size: 0, modifiedAt: workspace.createdAt },
          ]
          : path === 'docs'
            ? [{ name: 'nested', path: 'docs/nested', kind: 'directory', hidden: false, size: 0, modifiedAt: workspace.createdAt }]
            : [],
      }),
    })
    expect(await screen.findByRole('button', { name: /trailing\./u })).toBeTruthy()
    expect(screen.getByText('文件')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'docs' }))
    fireEvent.click(await screen.findByRole('button', { name: 'nested' }))
    const docs = await screen.findByRole('button', { name: 'docs' })
    expect(docs.getAttribute('aria-current')).toBeNull()
    fireEvent.click(docs)
    await waitFor(() => { expect(screen.getByRole('button', { name: 'docs' }).getAttribute('aria-current')).toBe('page') })
    fireEvent.click(screen.getByRole('button', { name: '根目录' }))
    expect(await screen.findByRole('button', { name: /trailing\./u })).toBeTruthy()
  })

  it('renders text, image, PDF, oversized, and unsupported previews with bounded sizes', async () => {
    const entries = [
      { name: 'notes.txt', path: 'notes.txt', kind: 'file' as const, hidden: false, size: 2_048, modifiedAt: workspace.createdAt },
      { name: 'photo.png', path: 'photo.png', kind: 'file' as const, hidden: false, size: 20_480, modifiedAt: workspace.createdAt },
      { name: 'manual.pdf', path: 'manual.pdf', kind: 'file' as const, hidden: false, size: 2_097_152, modifiedAt: workspace.createdAt },
      { name: 'large.bin', path: 'large.bin', kind: 'file' as const, hidden: false, size: 20_971_520, modifiedAt: workspace.createdAt },
      { name: 'opaque.bin', path: 'opaque.bin', kind: 'file' as const, hidden: false, size: 1, modifiedAt: workspace.createdAt },
    ]
    const previews: Record<string, WorkspaceFilePreview> = {
      'notes.txt': { path: 'notes.txt', name: 'notes.txt', mime: 'text/plain', size: 2_048, modifiedAt: workspace.createdAt, kind: 'text', encoding: 'utf8', content: 'plain text' },
      'photo.png': { path: 'photo.png', name: 'photo.png', mime: 'image/png', size: 20_480, modifiedAt: workspace.createdAt, kind: 'image', encoding: 'base64', content: 'iVBORw==' },
      'manual.pdf': { path: 'manual.pdf', name: 'manual.pdf', mime: 'application/pdf', size: 2_097_152, modifiedAt: workspace.createdAt, kind: 'pdf', encoding: 'base64', content: 'JVBERg==' },
      'large.bin': { path: 'large.bin', name: 'large.bin', mime: 'application/octet-stream', size: 20_971_520, modifiedAt: workspace.createdAt, kind: 'unsupported', encoding: 'none', content: '', reason: 'too-large' },
      'opaque.bin': { path: 'opaque.bin', name: 'opaque.bin', mime: 'application/octet-stream', size: 1, modifiedAt: workspace.createdAt, kind: 'binary', encoding: 'none', content: '' },
    }
    mount([workspace], {
      listFiles: async (_id, path) => ({ path, entries, truncated: true }),
      readFile: async (_id, path) => previews[path]!,
    })
    expect(await screen.findByText('此文件夹项目过多，仅显示前 1000 项。')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: /notes\.txt/u }))
    expect(await screen.findByText('plain text')).toBeTruthy()
    expect(screen.getAllByText('2.0 KiB')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /photo\.png/u }))
    expect(await screen.findByRole('img', { name: 'photo.png' })).toBeTruthy()
    expect(screen.getAllByText('20 KiB')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /manual\.pdf/u }))
    expect(await screen.findByLabelText('manual.pdf')).toBeTruthy()
    expect(screen.getAllByText('2.0 MiB')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /large\.bin/u }))
    expect(await screen.findByText('文件超过 8 MiB 预览上限，请在设备本地打开。')).toBeTruthy()
    expect(screen.getAllByText('20 MiB')).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /opaque\.bin/u }))
    expect(await screen.findByText('此文件格式暂不支持预览，可以下载后打开。')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '返回文件列表' }))
    expect(screen.getByText('选择一个文件进行预览。')).toBeTruthy()
  })

  it('surfaces list and preview failures and retries a list explicitly', async () => {
    const listFiles = vi.fn()
      .mockRejectedValueOnce(new Error('listing offline'))
      .mockResolvedValue({
        path: '', truncated: false,
        entries: [{ name: 'broken.txt', path: 'broken.txt', kind: 'file', hidden: false, size: 1, modifiedAt: workspace.createdAt }],
      })
    const view = mount([workspace], {
      listFiles,
      readFile: async () => { throw 'preview offline' },
    })
    expect(await screen.findByText(/listing offline/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    expect(await screen.findByRole('button', { name: /broken\.txt/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /broken\.txt/u }))
    expect(await screen.findByText(/preview offline/u)).toBeTruthy()
    expect(view.listFiles).toHaveBeenCalledTimes(2)
  })

  it('aborts superseded list and preview requests without publishing stale failures', async () => {
    const firstList = Promise.withResolvers<WorkspaceFileListing>()
    const secondList = Promise.withResolvers<WorkspaceFileListing>()
    const listFiles = vi.fn()
      .mockImplementationOnce(() => firstList.promise)
      .mockImplementationOnce(() => secondList.promise)
    const firstPreview = Promise.withResolvers<WorkspaceFilePreview>()
    const secondPreview = Promise.withResolvers<WorkspaceFilePreview>()
    const readFile = vi.fn()
      .mockImplementationOnce(() => firstPreview.promise)
      .mockImplementationOnce(() => secondPreview.promise)
    const view = mount([workspace], { listFiles, readFile })
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    firstList.reject(new Error('stale listing'))
    secondList.resolve({
      path: '', truncated: false,
      entries: [
        { name: 'one.txt', path: 'one.txt', kind: 'file', hidden: false, size: 1, modifiedAt: workspace.createdAt },
        { name: 'two.txt', path: 'two.txt', kind: 'file', hidden: false, size: 1, modifiedAt: workspace.createdAt },
      ],
    })
    expect(await screen.findByRole('button', { name: /one\.txt/u })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /one\.txt/u }))
    fireEvent.click(screen.getByRole('button', { name: /two\.txt/u }))
    firstPreview.reject(new Error('stale preview'))
    secondPreview.resolve({
      path: 'two.txt', name: 'two.txt', mime: 'text/plain', size: 1,
      modifiedAt: workspace.createdAt, kind: 'text', encoding: 'utf8', content: 'new preview',
    })
    expect(await screen.findByText('new preview')).toBeTruthy()
    expect(screen.queryByText(/stale/u)).toBeNull()
    view.unmount()
  })
})
