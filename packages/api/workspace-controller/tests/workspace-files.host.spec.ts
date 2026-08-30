import {
  mkdirSync, mkdtempSync, symlinkSync, truncateSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  listWorkspaceFiles, readWorkspaceFile, WORKSPACE_FILE_PREVIEW_MAX_BYTES,
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

  it('honors an already-aborted request', async () => {
    const root = workspace()
    writeFileSync(join(root, 'file.txt'), 'value')
    const controller = new AbortController()
    controller.abort(new Error('superseded'))
    await expect(listWorkspaceFiles(root, '', controller.signal)).rejects.toThrow('superseded')
    await expect(readWorkspaceFile(root, 'file.txt', controller.signal)).rejects.toThrow('superseded')
  })
})
