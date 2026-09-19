import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stageWindowsCrt } from './windows-crt.mjs'

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

/**
 * Verify Office assets through the deployed CLI and Web application dependencies.
 * @param {string} applicationRoot Production deployment directory.
 * @param {NodeJS.Platform} platform Target platform; staging runs on that platform.
 * @returns {void} Throws for missing assets or paths outside the deployment.
 */
export function verifyDesktopOfficeAssets(applicationRoot, platform = process.platform) {
  const application = realpathSync(applicationRoot)
  const owned = (path) => {
    const resolved = realpathSync(path)
    const local = relative(application, resolved)
    if (local === '..' || local.startsWith('../') || local.startsWith('..\\') || isAbsolute(local)) {
      throw new Error(`desktop stage: Office runtime path resolves outside the staged application: ${resolved}`)
    }
    return resolved
  }
  const desktop = createRequire(join(application, 'package.json'))
  const cli = createRequire(owned(desktop.resolve('@deepseek-ai/dsh/package.json')))
  const web = createRequire(owned(cli.resolve('@deepseek-ai/dsh-web-app/package.json')))
  const directory = join(dirname(owned(web.resolve('@deepseek-ai/dsh-office-to-pdf/package.json'))), 'lib/native')
  for (const file of ['entry.js', 'NOTICE', ...platform === 'darwin' ? ['libreoffice-kit-macos', 'manifest.json'] : []]) {
    const path = join(directory, file)
    if (!existsSync(path) || !statSync(owned(path)).isFile()) {
      throw new Error(`desktop stage is missing Office asset ${file}`)
    }
  }
}

if (import.meta.main) {
  runPnpm(['run', 'build:office-native'])
  // The root build includes only the host flock addon; Linux also ships the Landlock executable.
  if (process.platform === 'linux') runPnpm(['--dir', 'native/system', 'run', 'build:native'])
  rmSync(stage, { recursive: true, force: true })
  withPreservedWorkspaceState(workspaceState, () => runPnpm(deployArgs))
  if (process.platform === 'win32') stageWindowsCrt(stage)

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
    'build/runtime-bin/node',
    'build/runtime-bin/node.cmd',
    'build/runtime-bin/pnpm',
    'build/runtime-bin/pnpm.cmd',
    'node_modules/pnpm/bin/pnpm.mjs',
    'node_modules/@deepseek-ai/dsh/lib/bin.js',
  ]) {
    if (!existsSync(join(stage, required))) {
      throw new Error(`desktop stage is missing ${required}`)
    }
  }
  verifyDesktopOfficeAssets(stage)

  process.stdout.write(`desktop stage: ${stage}\n`)
}
