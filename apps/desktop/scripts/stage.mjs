import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(appDir, '../..')
const stage = join(root, 'dist', 'desktop-stage')
const workspaceStatePath = join(root, 'node_modules', '.pnpm-workspace-state-v1.json')
const workspaceState = existsSync(workspaceStatePath) ? readFileSync(workspaceStatePath) : undefined

rmSync(stage, { recursive: true, force: true })
const deployArgs = [
  '--filter',
  '@deepseek-ai/dsh-desktop',
  'deploy',
  '--prod',
  '--legacy',
  stage,
]
const packageManagerScript = process.env.npm_execpath
const command = packageManagerScript === undefined
  ? (process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm')
  : process.execPath
const args = packageManagerScript === undefined ? deployArgs : [packageManagerScript, ...deployArgs]
let deployed
try {
  deployed = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: packageManagerScript === undefined && process.platform === 'win32',
  })
} finally {
  // Legacy deploy records --prod against the workspace even though its install
  // target is separate. Preserve the caller's state so the next pnpm command
  // does not reconcile the repository to a production-only node_modules tree.
  if (workspaceState === undefined) rmSync(workspaceStatePath, { force: true })
  else writeFileSync(workspaceStatePath, workspaceState)
}
if (deployed.error !== undefined) throw deployed.error
if (deployed.status !== 0) process.exit(deployed.status ?? 1)

for (const required of [
  'lib/main.js',
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
