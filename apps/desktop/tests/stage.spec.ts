import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The desktop staging entry is plain JavaScript executed directly by Node.
import * as stageModule from '../scripts/stage.mjs'

const typedStageModule = stageModule as unknown as {
  readonly withPreservedWorkspaceState: <T>(path: string, deploy: () => T) => T
  readonly verifyDesktopOfficeAssets: (applicationRoot: string, platform?: NodeJS.Platform) => void
}
const { withPreservedWorkspaceState, verifyDesktopOfficeAssets } = typedStageModule
let temporaryRoot: string | undefined

afterEach(() => {
  if (temporaryRoot !== undefined) rmSync(temporaryRoot, { recursive: true, force: true })
  temporaryRoot = undefined
})

function workspaceStatePath(): string {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-desktop-stage-'))
  return join(temporaryRoot, '.pnpm-workspace-state-v1.json')
}

function officeFixture(escape?: 'cli' | 'web' | 'office'): { application: string; native: string; external: string } {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-desktop-office-stage-'))
  const application = join(temporaryRoot, 'application')
  const external = join(temporaryRoot, 'external')
  mkdirSync(application)
  writeFileSync(join(application, 'package.json'), '{}\n')
  let dependencyDirectory = join(application, 'node_modules')
  let provider = ''
  for (const [folder, name] of [
    ['cli', '@deepseek-ai/dsh'], ['web', '@deepseek-ai/dsh-web-app'], ['office', '@deepseek-ai/dsh-office-to-pdf'],
  ] as const) {
    const packageDirectory = join(folder === escape ? external : application, 'node_modules/.pnpm', folder, 'node_modules')
    const packageRoot = join(packageDirectory, name)
    mkdirSync(packageRoot, { recursive: true })
    writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({ name, exports: { './package.json': './package.json' } }))
    mkdirSync(join(dependencyDirectory, '@deepseek-ai'), { recursive: true })
    symlinkSync(packageRoot, join(dependencyDirectory, name), 'junction')
    dependencyDirectory = packageDirectory
    provider = packageRoot
  }
  const native = join(provider, 'lib/native')
  mkdirSync(native, { recursive: true })
  for (const file of ['entry.js', 'NOTICE', 'libreoffice-kit-macos', 'manifest.json']) writeFileSync(join(native, file), 'fixture\n')
  return { application, native, external }
}

describe('desktop production staging', () => {
  it('restores the source workspace state after deployment succeeds', () => {
    const state = workspaceStatePath()
    writeFileSync(state, 'development state\n')

    const result = withPreservedWorkspaceState(state, () => {
      writeFileSync(state, 'filtered production state\n')
      return 'deployed'
    })

    expect(result).toBe('deployed')
    expect(readFileSync(state, 'utf8')).toBe('development state\n')
  })

  it('restores the source workspace state after deployment fails', () => {
    const state = workspaceStatePath()
    writeFileSync(state, 'development state\n')

    expect(() => withPreservedWorkspaceState(state, () => {
      writeFileSync(state, 'filtered production state\n')
      throw new Error('deploy failed')
    })).toThrow('deploy failed')
    expect(readFileSync(state, 'utf8')).toBe('development state\n')
  })

  it('removes a workspace state created for a checkout that had none', () => {
    const state = workspaceStatePath()

    withPreservedWorkspaceState(state, () => {
      writeFileSync(state, 'filtered production state\n')
    })

    expect(existsSync(state)).toBe(false)
  })
})

describe('staged Office assets', () => {
  it.each(['darwin', 'linux', 'win32'] as const)('resolves the isolated dependency graph on %s', (platform) => {
    const { application, native } = officeFixture()
    expect(existsSync(join(application, 'node_modules/@deepseek-ai/dsh-office-to-pdf'))).toBe(false)
    if (platform !== 'darwin') {
      rmSync(join(native, 'libreoffice-kit-macos'))
      rmSync(join(native, 'manifest.json'))
    }
    expect(() => { verifyDesktopOfficeAssets(application, platform) }).not.toThrow()
  })

  it.each(['entry.js', 'NOTICE'])('requires %s on every platform', (file) => {
    const { application, native } = officeFixture()
    rmSync(join(native, file))
    for (const platform of ['darwin', 'linux', 'win32'] as const) {
      expect(() => { verifyDesktopOfficeAssets(application, platform) }).toThrow(`missing Office asset ${file}`)
    }
  })

  it.each(['libreoffice-kit-macos', 'manifest.json'])('requires %s on macOS', (file) => {
    const { application, native } = officeFixture()
    rmSync(join(native, file))
    expect(() => { verifyDesktopOfficeAssets(application, 'darwin') }).toThrow(`missing Office asset ${file}`)
  })

  it.each(['cli', 'web', 'office'] as const)('rejects a %s dependency outside the deployment', (escaped) => {
    const { application } = officeFixture(escaped)
    expect(() => { verifyDesktopOfficeAssets(application, 'darwin') }).toThrow('outside the staged application')
  })

  it('rejects native resources linked outside the deployment', () => {
    const { application, native, external } = officeFixture()
    mkdirSync(external)
    writeFileSync(join(external, 'entry.js'), 'fixture\n')
    rmSync(native, { recursive: true })
    symlinkSync(external, native, 'junction')
    expect(() => { verifyDesktopOfficeAssets(application, 'darwin') }).toThrow('outside the staged application')
  })

  it('rejects a directory in place of a required resource', () => {
    const { application, native } = officeFixture()
    rmSync(join(native, 'entry.js'))
    mkdirSync(join(native, 'entry.js'))
    expect(() => { verifyDesktopOfficeAssets(application, 'darwin') }).toThrow('missing Office asset entry.js')
  })
})
