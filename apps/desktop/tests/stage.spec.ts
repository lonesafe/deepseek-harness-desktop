import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

// @ts-expect-error The desktop staging entry is plain JavaScript executed directly by Node.
import * as stageModule from '../scripts/stage.mjs'

const typedStageModule = stageModule as unknown as {
  readonly withPreservedWorkspaceState: <T>(path: string, deploy: () => T) => T
}
const { withPreservedWorkspaceState } = typedStageModule
let temporaryRoot: string | undefined

afterEach(() => {
  if (temporaryRoot !== undefined) rmSync(temporaryRoot, { recursive: true, force: true })
  temporaryRoot = undefined
})

function workspaceStatePath(): string {
  temporaryRoot = mkdtempSync(join(tmpdir(), 'dsh-desktop-stage-'))
  return join(temporaryRoot, '.pnpm-workspace-state-v1.json')
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
