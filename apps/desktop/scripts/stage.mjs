import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(appDir, '../..')
const stage = join(root, 'dist', 'desktop-stage')

const deployArgs = [
  '--filter',
  '@deepseek-ai/dsh-desktop',
  'deploy',
  '--prod',
  '--legacy',
  stage,
]
const packageManagerScript = process.env.npm_execpath
const workspaceState = join(root, 'node_modules', '.pnpm-workspace-state-v1.json')

function runPnpm(args) {
  if (packageManagerScript === undefined || packageManagerScript === '') {
    throw new Error('desktop stage: invoke this script through a pnpm package command')
  }
  const javascript = /\.[cm]?js$/iu.test(packageManagerScript)
  const result = spawnSync(javascript ? process.execPath : packageManagerScript,
    javascript ? [packageManagerScript, ...args] : args, {
      cwd: root,
      stdio: 'inherit',
    })
  if (result.error !== undefined) throw result.error
  if (result.signal !== null || result.status !== 0) {
    throw new Error(`desktop stage: pnpm ${args.join(' ')} failed (exit ${String(result.status)}, signal ${String(result.signal)})`)
  }
}

/**
 * Run a desktop deployment without publishing its filtered install settings as source-workspace state.
 * @template T
 * @param {string} path pnpm workspace-state cache file owned by the source checkout.
 * @param {() => T} deploy synchronous deployment operation.
 * @returns {T} deployment result.
 */
export function withPreservedWorkspaceState(path, deploy) {
  let original
  try {
    original = readFileSync(path)
  } catch (error) {
    if (error === null || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error
  }

  try {
    return deploy()
  } finally {
    if (original === undefined) rmSync(path, { force: true })
    else writeFileSync(path, original)
  }
}

if (import.meta.main) {
  // The root build includes only the host flock addon; Linux also ships the Landlock executable.
  if (process.platform === 'linux') runPnpm(['--dir', 'native/system', 'run', 'build:native'])
  rmSync(stage, { recursive: true, force: true })
  withPreservedWorkspaceState(workspaceState, () => runPnpm(deployArgs))

  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const stageManifestPath = join(stage, 'package.json')
  const stageManifest = JSON.parse(readFileSync(stageManifestPath, 'utf8'))
  stageManifest.main = 'lib/web-main.js'
  stageManifest.version = rootManifest.version
  writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`)

  for (const required of [
    'lib/web-main.js',
    'electron-builder.yml',
    'build/icon.svg',
    'build/entitlements.mac.plist',
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
  ]) {
    if (!existsSync(join(stage, required))) {
      throw new Error(`desktop stage is missing ${required}`)
    }
  }

  process.stdout.write(`desktop stage: ${stage}\n`)
}
