/** Remembered V3 approvals survive read-only preparation and immutable successor publication. */

import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId, SessionSeq } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generationLogPath, type JsonlCompression } from '../src/format.ts'
import { compressZstdFrame } from '../src/zstd.ts'

const id = SessionId('v3-remembered-approval')
const header = { type: 'session', version: 3, id, createdAt: 1000, isSeeded: false, delegationDepth: 0 }
const approvals = [
  {
    type: 'approval/asked', seq: 0, time: 1001,
    data: { id: 'grant', toolName: 'bash', alwaysAllowKey: 'sandbox:bash:workspace-write' },
  },
  { type: 'approval/decided', seq: 1, time: 1002, data: { id: 'grant', outcome: 'allowed-always' } },
]
let root: string
const contexts: Context[] = []

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-v3-approval-migration-'))
})

afterEach(async () => {
  try {
    for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

async function mount(compression: JsonlCompression): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(JsonlSessionPersistence, { root, compression })
  return ctx
}

async function observe(path: string) {
  const identity = await stat(path, { bigint: true })
  return {
    bytes: await readFile(path), dev: identity.dev, ino: identity.ino,
    size: identity.size, mtimeNs: identity.mtimeNs, ctimeNs: identity.ctimeNs,
  }
}

describe('V3 remembered approvals through current JSONL persistence', () => {
  it.each(['none', 'zstd'] as const)('reads without publishing, then preserves V3 through publication and append (%s)', async (compression) => {
    const predecessor = generationLogPath(root, undefined, id, 3, compression)
    const successor = generationLogPath(root, undefined, id, SESSION_FORMAT_VERSION, compression)
    const chunks = [
      JSON.stringify(header) + '\n',
      approvals.map(row => JSON.stringify(row)).join('\n') + '\n',
    ]
    await mkdir(dirname(predecessor), { recursive: true })
    await writeFile(predecessor, compression === 'none' ? Buffer.from(chunks.join(''))
      : Buffer.concat(await Promise.all(chunks.map(chunk => compressZstdFrame(chunk)))))
    const original = await observe(predecessor)
    const ctx = await mount(compression)

    const reader = await ctx.sessionPersistence.open(id, 'read')
    try {
      expect(reader.header).toEqual({ version: SESSION_FORMAT_VERSION, id, createdAt: 1000, isSeeded: false, delegationDepth: 0 })
      expect(reader.inheritedEventCount).toBe(0)
      expect((await reader.read()).events).toEqual(approvals)
    } finally {
      await reader.close()
    }
    await ctx.sessionPersistence.flush()
    expect(await observe(predecessor)).toEqual(original)
    expect(await readdir(dirname(predecessor))).toEqual([basename(predecessor)])
    await expect(stat(successor)).rejects.toMatchObject({ code: 'ENOENT' })

    const appended = { type: 'feedback/record' as const, seq: SessionSeq(2), time: 1003, data: { text: 'continued' } }
    const writer = await ctx.sessionPersistence.open(id, 'write')
    try {
      expect(writer.header.version).toBe(SESSION_FORMAT_VERSION)
      expect((await writer.read()).events).toEqual(approvals)
      expect((await stat(successor)).isFile()).toBe(true)
      await writer.append([appended])
      await writer.flush()
    } finally {
      await writer.close()
    }
    await ctx.fiber.dispose()
    contexts.splice(contexts.indexOf(ctx), 1)
    expect(await observe(predecessor)).toEqual(original)
    expect((await readdir(dirname(predecessor))).filter(name => name !== 'session.lock').sort())
      .toEqual([basename(predecessor), basename(successor)].sort())
    const published = await observe(successor)

    const fresh = await mount(compression)
    const reopened = await fresh.sessionPersistence.open(id, 'read')
    try {
      expect(reopened.header.version).toBe(SESSION_FORMAT_VERSION)
      expect((await reopened.read()).events).toEqual([...approvals, appended])
    } finally {
      await reopened.close()
    }
    await fresh.sessionPersistence.flush()
    expect(await observe(predecessor)).toEqual(original)
    expect(await observe(successor)).toEqual(published)
  })
})
