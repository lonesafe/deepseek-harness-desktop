import {
  mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  listWorkspaceFiles, readWorkspaceFile, WORKSPACE_FILE_PREVIEW_MAX_BYTES,
} from '../src/workspace-files.ts'

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    open: vi.fn(actual.open),
    opendir: vi.fn(actual.opendir),
    realpath: vi.fn(actual.realpath),
    stat: vi.fn(actual.stat),
  }
})

afterEach(() => {
  vi.mocked(fsPromises.open).mockClear()
  vi.mocked(fsPromises.opendir).mockClear()
  vi.mocked(fsPromises.realpath).mockClear()
  vi.mocked(fsPromises.stat).mockClear()
})

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-workspace-files-'))
}

function signal(): AbortSignal {
  return new AbortController().signal
}

describe('Workspace file projection', () => {
  it('lists directories before files with portable relative paths', async () => {
    const root = workspace()
    mkdirSync(join(root, 'docs'))
    writeFileSync(join(root, 'z.txt'), 'z')
    writeFileSync(join(root, '.env'), 'SECRET=test')

    const rootListing = await listWorkspaceFiles(root, '', signal())
    expect(rootListing.entries.map(entry => [entry.name, entry.path, entry.kind, entry.hidden])).toEqual([
      ['docs', 'docs', 'directory', false],
      ['.env', '.env', 'file', true],
      ['z.txt', 'z.txt', 'file', false],
    ])

    writeFileSync(join(root, 'docs', 'README.md'), '# Nested')
    expect((await listWorkspaceFiles(root, 'docs', signal())).entries[0]?.path).toBe(['docs', 'README.md'].join('/'))
  })

  it('projects Markdown, UTF-8 fallback text, images, and oversized files', async () => {
    const root = workspace()
    writeFileSync(join(root, 'README.md'), '# Preview\n')
    writeFileSync(join(root, 'notes.unknown'), 'plain fallback')
    writeFileSync(join(root, 'pixel.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    writeFileSync(join(root, 'large.bin'), '')
    truncateSync(join(root, 'large.bin'), WORKSPACE_FILE_PREVIEW_MAX_BYTES + 1)

    expect(await readWorkspaceFile(root, 'README.md', signal())).toMatchObject({
      kind: 'markdown', encoding: 'utf8', content: '# Preview\n', mime: 'text/markdown',
    })
    expect(await readWorkspaceFile(root, 'notes.unknown', signal())).toMatchObject({
      kind: 'text', encoding: 'utf8', content: 'plain fallback', mime: 'text/plain',
    })
    expect(await readWorkspaceFile(root, 'pixel.png', signal())).toMatchObject({
      kind: 'image', encoding: 'base64', mime: 'image/png', content: 'iVBORw==',
    })
    expect(await readWorkspaceFile(root, 'large.bin', signal())).toMatchObject({
      kind: 'unsupported', encoding: 'none', content: '', reason: 'too-large',
    })
  })

  it('projects extensionless text, PDFs, and binary data', async () => {
    const root = workspace()
    writeFileSync(join(root, 'README'), 'plain readme')
    writeFileSync(join(root, 'paper.pdf'), '%PDF')
    writeFileSync(join(root, 'nul.dat'), Buffer.from([0, 1]))
    writeFileSync(join(root, 'invalid.dat'), Buffer.from([0xff]))

    expect(await readWorkspaceFile(root, 'README', signal())).toMatchObject({
      kind: 'text', encoding: 'utf8', content: 'plain readme', mime: 'text/plain',
    })
    expect(await readWorkspaceFile(root, 'paper.pdf', signal())).toMatchObject({
      kind: 'pdf', encoding: 'base64', mime: 'application/pdf', content: 'JVBERg==',
    })
    for (const name of ['nul.dat', 'invalid.dat']) {
      expect(await readWorkspaceFile(root, name, signal())).toMatchObject({
        kind: 'binary', encoding: 'base64', mime: 'application/octet-stream',
      })
    }
  })

  it.each(['../outside', '/absolute', 'nested\\windows', './dot'])(
    'rejects non-portable or escaping path %s',
    async (path) => {
      const root = workspace()
      await expect(listWorkspaceFiles(root, path, signal())).rejects.toMatchObject({
        code: 'workspace-file-invalid-path',
      })
    },
  )

  it.runIf(process.platform !== 'win32')('hides and rejects symlinks that escape the Workspace', async () => {
    const root = workspace()
    const outside = workspace()
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(outside, join(root, 'outside'))

    expect((await listWorkspaceFiles(root, '', signal())).entries).toEqual([])
    await expect(readWorkspaceFile(root, 'outside/secret.txt', signal())).rejects.toMatchObject({
      code: 'workspace-file-invalid-path',
    })
  })

  it.runIf(process.platform !== 'win32')('skips unsupported, broken, and non-file directory entries', async () => {
    const root = workspace()
    const socketPath = join(root, 'endpoint.sock')
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, resolve)
    })
    symlinkSync(socketPath, join(root, 'socket-link'))
    symlinkSync(join(root, 'missing'), join(root, 'broken-link'))
    try {
      expect((await listWorkspaceFiles(root, '', signal())).entries).toEqual([])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error === undefined) resolve(); else reject(error) })
      })
    }
  })

  it('reports root, target, metadata, iteration, and open failures without assuming Error throws', async () => {
    const root = workspace()
    writeFileSync(join(root, 'file.txt'), 'value')
    const canonical = await fsPromises.realpath(root)

    vi.mocked(fsPromises.realpath).mockRejectedValueOnce('missing root')
    await expect(listWorkspaceFiles(root, '', signal())).rejects.toThrow('missing root')
    await expect(listWorkspaceFiles(join(root, 'missing-root'), '', signal())).rejects.toThrow(/ENOENT/)

    vi.mocked(fsPromises.realpath).mockResolvedValueOnce(canonical).mockRejectedValueOnce('missing target')
    await expect(listWorkspaceFiles(root, 'missing', signal())).rejects.toThrow('missing target')
    await expect(listWorkspaceFiles(root, 'also-missing', signal())).rejects.toThrow(/ENOENT/)

    vi.mocked(fsPromises.stat).mockRejectedValueOnce('metadata unavailable')
    await expect(listWorkspaceFiles(root, '', signal())).rejects.toThrow('metadata unavailable')
    vi.mocked(fsPromises.stat).mockRejectedValueOnce(new Error('metadata error'))
    await expect(listWorkspaceFiles(root, '', signal())).rejects.toThrow('metadata error')

    vi.mocked(fsPromises.opendir).mockRejectedValueOnce('directory closed')
    await expect(listWorkspaceFiles(root, '', signal())).rejects.toThrow('directory closed')
    vi.mocked(fsPromises.opendir).mockRejectedValueOnce(new Error('directory error'))
    await expect(listWorkspaceFiles(root, '', signal())).rejects.toThrow('directory error')

    vi.mocked(fsPromises.open).mockRejectedValueOnce('descriptor unavailable')
    await expect(readWorkspaceFile(root, 'file.txt', signal())).rejects.toThrow('descriptor unavailable')
    vi.mocked(fsPromises.open).mockRejectedValueOnce(new Error('descriptor error'))
    await expect(readWorkspaceFile(root, 'file.txt', signal())).rejects.toThrow('descriptor error')
  })

  it('rejects a listing file, an empty preview path, and a non-file preview target', async () => {
    const root = workspace()
    writeFileSync(join(root, 'file.txt'), 'value')
    await expect(listWorkspaceFiles(root, 'file.txt', signal())).rejects.toMatchObject({
      code: 'workspace-file-unreadable',
    })
    await expect(readWorkspaceFile(root, '', signal())).rejects.toMatchObject({
      code: 'workspace-file-invalid-path',
    })
    const close = vi.fn().mockResolvedValue(undefined)
    vi.mocked(fsPromises.open).mockResolvedValueOnce({
      stat: () => Promise.resolve({ isFile: () => false }),
      close,
    } as never)
    await expect(readWorkspaceFile(root, 'file.txt', signal())).rejects.toMatchObject({
      code: 'workspace-file-not-file',
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('truncates a directory and a file that grows after metadata is read', async () => {
    const root = workspace()
    for (let index = 0; index <= 1_000; index++) writeFileSync(join(root, `file-${index}.txt`), '')
    const listing = await listWorkspaceFiles(root, '', signal())
    expect(listing.entries).toHaveLength(1_000)
    expect(listing.truncated).toBe(true)

    const target = join(root, 'growing.bin')
    writeFileSync(target, 'x')
    const close = vi.fn().mockResolvedValue(undefined)
    vi.mocked(fsPromises.open).mockResolvedValueOnce({
      stat: () => Promise.resolve({ isFile: () => true, size: 1, mtime: new Date(0) }),
      readFile: () => Promise.resolve(Buffer.alloc(WORKSPACE_FILE_PREVIEW_MAX_BYTES + 1)),
      close,
    } as never)
    expect(await readWorkspaceFile(root, 'growing.bin', signal())).toMatchObject({
      kind: 'unsupported', reason: 'too-large', size: WORKSPACE_FILE_PREVIEW_MAX_BYTES + 1,
    })
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('honors an already-aborted request', async () => {
    const root = workspace()
    writeFileSync(join(root, 'file.txt'), 'value')
    const controller = new AbortController()
    controller.abort(new Error('superseded'))
    await expect(listWorkspaceFiles(root, '', controller.signal)).rejects.toThrow('superseded')
    await expect(readWorkspaceFile(root, 'file.txt', controller.signal)).rejects.toThrow('superseded')
  })
})
