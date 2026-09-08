/** Verify native dependencies through the Electron executable and its deployed package graph. */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PROBE = `
import { accessSync, constants, realpathSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

const [root, temporary] = process.argv.slice(1)
const application = realpathSync(root)
function owned(path) {
  const resolved = realpathSync(path)
  const local = relative(application, resolved)
  if (local === '..' || local.startsWith('../') || local.startsWith('..\\\\') || isAbsolute(local)) {
    throw new Error('native dependency resolves outside the packaged application: ' + resolved)
  }
  return resolved
}
const applicationRequire = createRequire(join(application, 'package.json'))
const dshRequire = createRequire(owned(applicationRequire.resolve('@deepseek-ai/dsh/package.json')))
const persistenceRequire = createRequire(owned(dshRequire.resolve('@deepseek-ai/dsh-session-persistence-jsonl/package.json')))

if (process.platform === 'win32') {
  const { default: koffi } = await import(pathToFileURL(owned(persistenceRequire.resolve('koffi'))).href)
  const kernel32 = koffi.load('kernel32.dll')
  const getCurrentProcessId = kernel32.func('__stdcall', 'GetCurrentProcessId', 'uint', [])
  if (getCurrentProcessId() !== process.pid) throw new Error('Koffi returned an incorrect process identity')
} else {
  const { tryLockExclusive } = await import(pathToFileURL(owned(persistenceRequire.resolve('@deepseek-ai/node-addon-system/flock'))).href)
  const handle = await open(join(temporary, 'session.lock'), 'wx')
  try {
    await tryLockExclusive(handle.fd)
  } finally {
    await handle.close()
  }
  if (process.platform === 'linux') {
    const { launcherPath } = await import(pathToFileURL(owned(persistenceRequire.resolve('@deepseek-ai/node-addon-system/landlock-run'))).href)
    accessSync(owned(launcherPath()), constants.X_OK)
  }
}
const addons = Object.keys(applicationRequire.cache).filter(path => path.endsWith('.node'))
if (addons.length === 0) throw new Error('native operation did not load a .node addon')
for (const addon of addons) owned(addon)
process.stdout.write('native runtime verified')
`

/**
 * Exercise the deployed platform addon and require the Linux launcher payload.
 * Every loaded .node binary must resolve inside the application directory.
 * @param {string} executable Electron executable, run with ELECTRON_RUN_AS_NODE.
 * @param {string} applicationRoot Deployed application directory containing package.json.
 * @param {string} label Diagnostic name for the staged or packaged application.
 * @returns {void} Throws when resolution escapes the application or a native operation fails.
 */
export function verifyDesktopNativeRuntime(executable, applicationRoot, label) {
  const temporary = mkdtempSync(join(tmpdir(), 'dsh-desktop-native-'))
  try {
    const probe = spawnSync(executable, ['--input-type=module', '-e', PROBE, applicationRoot, temporary], {
      encoding: 'utf8',
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      timeout: 30_000,
      killSignal: 'SIGKILL',
    })
    if (probe.error !== undefined) throw new Error(`${label}: ${probe.error.message}`, { cause: probe.error })
    if (probe.signal !== null || probe.status !== 0 || probe.stdout !== 'native runtime verified') {
      throw new Error(`${label}: native runtime verification failed (exit ${String(probe.status)}, signal ${String(probe.signal)}):\n${probe.stderr}`)
    }
    process.stdout.write(`${label}: native runtime verified\n`)
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
}
