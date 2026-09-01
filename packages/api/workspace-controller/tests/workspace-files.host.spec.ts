import {
  chmodSync, mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  listWorkspaceFiles, readWorkspaceFile, WORKSPACE_FILE_ENTRY_LIMIT, WORKSPACE_FILE_PREVIEW_MAX_BYTES,
} from '../src/workspace-files.ts'

function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-workspace-files-'))
}

function signal(): AbortSignal {
  return new AbortController().signal
}

describe('Workspace Controller file projection', () => {
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

  it('projects declared text, PDF, binary, and extensionless text content', async () => {
    const root = workspace()
    writeFileSync(join(root, 'script.ts'), 'export {}\n')
    writeFileSync(join(root, 'Makefile'), 'all:\n')
    writeFileSync(join(root, 'manual.pdf'), Buffer.from('%PDF'))
    writeFileSync(join(root, 'opaque.bin'), Buffer.from([0, 255]))

    await expect(readWorkspaceFile(root, 'script.ts', signal())).resolves.toMatchObject({
      kind: 'text', encoding: 'utf8', mime: 'text/typescript',
    })
    await expect(readWorkspaceFile(root, 'Makefile', signal())).resolves.toMatchObject({
      kind: 'text', encoding: 'utf8', mime: 'application/octet-stream',
    })
    await expect(readWorkspaceFile(root, 'manual.pdf', signal())).resolves.toMatchObject({
      kind: 'pdf', encoding: 'base64', mime: 'application/pdf',
    })
    await expect(readWorkspaceFile(root, 'opaque.bin', signal())).resolves.toMatchObject({
      kind: 'binary', encoding: 'base64', mime: 'application/octet-stream',
    })
  })

  it('rejects missing roots, missing paths, empty previews, and directory previews', async () => {
    const root = workspace()
    mkdirSync(join(root, 'docs'))
    await expect(listWorkspaceFiles(join(root, 'missing-root'), '', signal())).rejects.toMatchObject({
      code: 'workspace/file-unreadable',
    })
    await expect(listWorkspaceFiles(root, 'missing', signal())).rejects.toMatchObject({
      code: 'workspace/file-unreadable',
    })
    writeFileSync(join(root, 'file.txt'), 'x')
    await expect(listWorkspaceFiles(root, 'file.txt', signal())).rejects.toMatchObject({
      code: 'workspace/file-unreadable',
    })
    await expect(listWorkspaceFiles(root, 'docs/../missing', signal())).rejects.toMatchObject({
      code: 'workspace/file-invalid-path',
    })
    await expect(readWorkspaceFile(root, '', signal())).rejects.toMatchObject({
      code: 'workspace/file-invalid-path',
    })
    await expect(readWorkspaceFile(root, 'missing.txt', signal())).rejects.toMatchObject({
      code: 'workspace/file-unreadable',
    })
    await expect(readWorkspaceFile(root, 'docs', signal())).rejects.toMatchObject({
      code: 'workspace/file-not-file',
    })
  })

  it('marks a directory listing truncated at the configured row bound', async () => {
    const root = workspace()
    for (let index = 0; index <= WORKSPACE_FILE_ENTRY_LIMIT; index++) {
      writeFileSync(join(root, `file-${String(index).padStart(4, '0')}.txt`), 'x')
    }
    const listing = await listWorkspaceFiles(root, '', signal())
    expect(listing.entries).toHaveLength(WORKSPACE_FILE_ENTRY_LIMIT)
    expect(listing.truncated).toBe(true)
  })

  it.runIf(process.platform !== 'win32')('maps an unreadable directory iteration', async () => {
    const root = workspace()
    const locked = join(root, 'locked')
    mkdirSync(locked)
    chmodSync(locked, 0)
    try {
      await expect(listWorkspaceFiles(root, 'locked', signal())).rejects.toMatchObject({
        code: 'workspace/file-unreadable',
      })
    } finally {
      chmodSync(locked, 0o700)
    }
  })

  it.runIf(process.platform !== 'win32')('maps a file that becomes unreadable before opening', async () => {
    const root = workspace()
    const locked = join(root, 'locked.txt')
    writeFileSync(locked, 'secret')
    chmodSync(locked, 0)
    try {
      await expect(readWorkspaceFile(root, 'locked.txt', signal())).rejects.toMatchObject({
        code: 'workspace/file-unreadable',
      })
    } finally {
      chmodSync(locked, 0o600)
    }
  })

  it.each(['../outside', '/absolute', 'nested\\windows', './dot'])(
    'rejects non-portable or escaping path %s',
    async (path) => {
      const root = workspace()
      await expect(listWorkspaceFiles(root, path, signal())).rejects.toMatchObject({
        code: 'workspace/file-invalid-path',
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
      code: 'workspace/file-invalid-path',
    })
  })

  it.runIf(process.platform !== 'win32')('skips dangling symlinks while listing', async () => {
    const root = workspace()
    symlinkSync(join(root, 'missing'), join(root, 'dangling'))
    await expect(listWorkspaceFiles(root, '', signal())).resolves.toMatchObject({ entries: [] })
  })

  it.runIf(process.platform !== 'win32')('skips unsupported directory entries and symlink targets', async () => {
    const root = workspace()
    const fifo = join(root, 'pipe')
    execFileSync('mkfifo', [fifo])
    symlinkSync(fifo, join(root, 'pipe-link'))
    await expect(listWorkspaceFiles(root, '', signal())).resolves.toMatchObject({ entries: [] })
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
