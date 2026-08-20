/** Registration/capability behavior of the native backend (the seam's cordis half). */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import NativeDirectoryPicker from '../src/index.ts'

describe('NativeDirectoryPicker', () => {
  it('registers ctx.directoryPicker with a stable adaptive capability and leaves with its fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(NativeDirectoryPicker)
    await fiber.await()
    const picker = ctx.get('directoryPicker')
    expect(picker).toBeInstanceOf(NativeDirectoryPicker)
    const capability = picker!.capability()
    expect(capability.kind).toBe('adaptive')
    if (capability.kind !== 'adaptive') throw new Error('expected the adaptive directory-picker capability')
    const root = mkdtempSync(join(tmpdir(), 'dsh-native-picker-'))
    try {
      await expect(capability.list(root, new AbortController().signal)).resolves.toMatchObject({ path: root })
      await expect(capability.createDirectory(root, 'created')).resolves.toBe(join(root, 'created'))
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    // Stability: consumers may capture the capability object across calls.
    expect(picker!.capability()).toBe(capability)
    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })
})
