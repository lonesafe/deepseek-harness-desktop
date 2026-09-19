/** The shipped launchers run plugin package scripts without system Node or pnpm. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { execa } from 'execa'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { resolveHarnessEnvironment } from '../src/backend.ts'

const require = createRequire(import.meta.url)
const applicationRoot = fileURLToPath(new URL('../', import.meta.url))

afterEach(() => { vi.unstubAllEnvs() })

it('keeps bundled pnpm and Node usable after the plugin manager scrubs its environment', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'dsh desktop package-'))
  try {
    const executable = require('electron') as string
    const systemPath = process.platform === 'win32'
      ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32') : '/usr/bin:/bin'
    const environment = resolveHarnessEnvironment(executable, applicationRoot, { PATH: systemPath })
    for (const [key, value] of Object.entries(environment)) vi.stubEnv(key, value)
    await writeFile(join(temporary, 'package.json'), JSON.stringify({
      name: 'desktop-script-probe', private: true, scripts: { probe: 'node probe.cjs' },
    }))
    await writeFile(join(temporary, 'probe.cjs'), `
const assert = require('node:assert/strict')
assert.equal(process.execPath, ${JSON.stringify(executable)})
assert.ok(process.versions.electron)
assert.equal(typeof require('internal/modules/esm/loader').getOrInitializeCascadedLoader, 'function')
console.log('bundled-package-script-ok')
`)
    const result = await execa('pnpm', ['run', 'probe'], {
      cwd: temporary, env: scrubbedParentEnv(), extendEnv: false, timeout: 45_000,
    })
    expect(result.stdout).toContain('bundled-package-script-ok')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}, 60_000)
