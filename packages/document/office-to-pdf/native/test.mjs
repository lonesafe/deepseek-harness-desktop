/** Verify a built helper's event sequence and rejection of damaged release artifacts. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const { values } = parseArgs({ options: { output: { type: 'string' } } })

if (process.platform !== 'darwin') {
  console.log('Office Quartz wake sequence: macOS only')
} else {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-office-wake-test-'))
  try {
    const executable = join(directory, 'wakeup-test')
    for (const [command, args] of [
      ['c++', ['-std=c++17', '-O2', fileURLToPath(new URL('./tests/wakeup.mm', import.meta.url)),
        '-framework', 'AppKit', '-o', executable]],
      [executable, []],
    ]) {
      const result = spawnSync(command, args, { stdio: 'inherit' })
      if (result.error !== undefined) throw result.error
      if (result.signal !== null || result.status !== 0) {
        throw new Error(`Office native test: ${command} exited ${String(result.status)}, signal ${String(result.signal)}`)
      }
    }
    const artifacts = resolve(values.output ?? fileURLToPath(new URL('../lib/native/', import.meta.url)))
    for (const variant of ['intact', 'checksum', 'architecture', 'permission', 'adapter']) {
      const copied = join(directory, variant)
      await mkdir(copied)
      for (const file of ['entry.js', 'libreoffice-kit-macos', 'manifest.json', 'NOTICE']) {
        await copyFile(join(artifacts, file), join(copied, file))
      }
      const helper = join(copied, 'libreoffice-kit-macos')
      if (variant === 'checksum') {
        const bytes = await readFile(helper)
        bytes[bytes.length - 1] ^= 1
        await writeFile(helper, bytes)
      } else if (variant === 'permission') {
        await chmod(helper, 0o600)
      } else if (variant === 'architecture' || variant === 'adapter') {
        const file = variant === 'architecture' ? 'libreoffice-kit-macos' : 'entry.js'
        const bytes = await readFile(join(copied, file))
        if (variant === 'architecture') bytes.writeUInt32BE(0, 8)
        else bytes[0] ^= 1
        await writeFile(join(copied, file), bytes)
        const manifest = JSON.parse(await readFile(join(copied, 'manifest.json'), 'utf8'))
        manifest.files[file] = createHash('sha256').update(bytes).digest('hex')
        await writeFile(join(copied, 'manifest.json'), JSON.stringify(manifest))
      }
      const result = spawnSync(process.execPath,
        [fileURLToPath(new URL('./build.mjs', import.meta.url)), '--verify', '--output', copied],
        { encoding: 'utf8', timeout: 30_000 })
      assert.ifError(result.error)
      assert.equal(result.signal, null)
      if (variant === 'intact') assert.equal(result.status, 0, result.stderr)
      else {
        assert.equal(result.status, 1, result.stderr)
        const reasons = { checksum: 'checksum mismatch', architecture: 'must contain x86_64 and arm64',
          permission: 'no executable permission', adapter: 'adapter does not match the installed kit' }
        assert.ok(result.stderr.includes(reasons[variant]), result.stderr)
      }
    }
    console.log('Office release artifacts: intact, checksum, architecture, permission, adapter cases passed')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
