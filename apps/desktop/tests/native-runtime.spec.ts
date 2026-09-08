import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { verifyDesktopNativeRuntime } from '../scripts/native-runtime.mjs'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-native-test-'))
  roots.push(root)
  return root
}

function runtimeFixture(): { root: string; native: string; called: string; payloadDirectory: string } {
  const root = temporaryRoot()
  const native = join(root, 'node_modules/@deepseek-ai/node-addon-system')
  const called = join(root, 'native-called')
  const payloadDirectory = join(native, 'bin')
  const payload = join(payloadDirectory, 'system.node')
  const manifests = [
    ['', { private: true }],
    ['node_modules/@deepseek-ai/dsh', { name: '@deepseek-ai/dsh' }],
    ['node_modules/@deepseek-ai/dsh-session-persistence-jsonl', { name: '@deepseek-ai/dsh-session-persistence-jsonl' }],
    ['node_modules/@deepseek-ai/node-addon-system', {
      name: '@deepseek-ai/node-addon-system',
      type: 'module',
      exports: { './flock': './flock.js', './landlock-run': './landlock-run.js' },
    }],
    ['node_modules/koffi', { name: 'koffi', main: 'index.js', type: 'module' }],
  ] as const
  for (const [path, manifest] of manifests) {
    mkdirSync(join(root, path), { recursive: true })
    writeFileSync(join(root, path, 'package.json'), JSON.stringify(manifest))
  }
  mkdirSync(payloadDirectory)
  writeFileSync(payload, 'synthetic addon')
  // The child owns this loader; Node still resolves and caches the real .node path.
  const loader = `
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
require.extensions['.node'] = (module) => {
  module.exports = (operation) => {
    writeFileSync(${JSON.stringify(called)}, operation)
    return process.pid
  }
}
function nativeOperation(operation) { return require(${JSON.stringify(payload)})(operation) }
`
  writeFileSync(join(native, 'flock.js'), `${loader}
export async function tryLockExclusive() { nativeOperation('flock') }
`)
  writeFileSync(join(native, 'landlock-run.js'), `
import { fileURLToPath } from 'node:url'
export function launcherPath() { return fileURLToPath(new URL('./landlock-run', import.meta.url)) }
`)
  writeFileSync(join(native, 'landlock-run'), 'fixture')
  chmodSync(join(native, 'landlock-run'), 0o755)
  writeFileSync(join(root, 'node_modules/koffi/index.js'), `${loader}
export default { load() { return { func() { return () => nativeOperation('koffi') } } } }
`)
  return { root, native, called, payloadDirectory }
}

describe('desktop native runtime verification', () => {
  it('executes the native operation through the deployed dependency graph', () => {
    const { root, called } = runtimeFixture()
    verifyDesktopNativeRuntime(process.execPath, root, 'test runtime')
    expect(readFileSync(called, 'utf8')).toBe(process.platform === 'win32' ? 'koffi' : 'flock')
  })

  it('rejects an addon that imports successfully but fails when first used', () => {
    const { root, native } = runtimeFixture()
    if (process.platform === 'win32') {
      writeFileSync(join(root, 'node_modules/koffi/index.js'), `
export default { load() { throw new Error('missing native payload') } }
`)
    } else {
      writeFileSync(join(native, 'flock.js'), `
export async function tryLockExclusive() { throw new Error('missing native payload') }
`)
    }
    expect(() => { verifyDesktopNativeRuntime(process.execPath, root, 'test runtime') }).toThrow('missing native payload')
  })

  it('rejects an owned wrapper that loads an external native payload', () => {
    const { root, called, payloadDirectory } = runtimeFixture()
    const outside = temporaryRoot()
    writeFileSync(join(outside, 'system.node'), 'external synthetic addon')
    rmSync(payloadDirectory, { recursive: true })
    symlinkSync(outside, payloadDirectory, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => { verifyDesktopNativeRuntime(process.execPath, root, 'test runtime') })
      .toThrow('native dependency resolves outside the packaged application')
    expect(readFileSync(called, 'utf8')).toBe(process.platform === 'win32' ? 'koffi' : 'flock')
  })

  it('rejects a successful operation that did not load a native addon', () => {
    const { root, native } = runtimeFixture()
    if (process.platform === 'win32') {
      writeFileSync(join(root, 'node_modules/koffi/index.js'), `
export default { load() { return { func() { return () => process.pid } } } }
`)
    } else {
      writeFileSync(join(native, 'flock.js'), `
export async function tryLockExclusive() {}
`)
    }

    expect(() => { verifyDesktopNativeRuntime(process.execPath, root, 'test runtime') })
      .toThrow('native operation did not load a .node addon')
  })

  it('rejects dependencies resolved from outside the packaged application', () => {
    const { root } = runtimeFixture()
    const outside = temporaryRoot()
    writeFileSync(join(outside, 'package.json'), JSON.stringify({ name: '@deepseek-ai/dsh' }))
    const dsh = join(root, 'node_modules/@deepseek-ai/dsh')
    rmSync(dsh, { recursive: true })
    symlinkSync(outside, dsh, process.platform === 'win32' ? 'junction' : 'dir')

    expect(() => { verifyDesktopNativeRuntime(process.execPath, root, 'test runtime') })
      .toThrow('native dependency resolves outside the packaged application')
  })

  it.skipIf(process.platform !== 'linux')('rejects a Linux runtime missing its Landlock launcher', () => {
    const { root, native } = runtimeFixture()
    rmSync(join(native, 'landlock-run'))
    expect(() => { verifyDesktopNativeRuntime(process.execPath, root, 'test runtime') }).toThrow('landlock-run')
  })
})
