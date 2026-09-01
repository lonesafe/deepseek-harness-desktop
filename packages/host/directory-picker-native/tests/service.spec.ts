/** Registration/capability behavior of the native backend (the seam's cordis half). */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { mkdtemp, rm } from 'node:fs/promises'
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
    // Stability: consumers may capture the capability object across calls.
    expect(picker!.capability()).toBe(capability)
    await fiber.dispose()
    expect(ctx.get('directoryPicker')).toBeUndefined()
  })

  it('forwards remote browsing through the adaptive capability', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-native-picker-'))
    const ctx = new Context()
    const fiber = await ctx.plugin(NativeDirectoryPicker)
    try {
      const capability = ctx.directoryPicker.capability()
      if (capability.kind !== 'adaptive') throw new Error(`expected adaptive capability, received ${capability.kind}`)
      await expect(capability.list(root, new AbortController().signal)).resolves.toMatchObject({ path: root })
      await expect(capability.createDirectory(root, 'created')).resolves.toBe(join(root, 'created'))
    } finally {
      await fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
