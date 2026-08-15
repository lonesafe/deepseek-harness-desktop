import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(appDir, '../..')
const stage = join(root, 'dist', 'desktop-stage')

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
const deployed = spawnSync(command, args, {
  cwd: root,
  stdio: 'inherit',
  shell: packageManagerScript === undefined && process.platform === 'win32',
})
if (deployed.error !== undefined) throw deployed.error
if (deployed.status !== 0) process.exit(deployed.status ?? 1)

const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const stageManifestPath = join(stage, 'package.json')
const stageManifest = JSON.parse(readFileSync(stageManifestPath, 'utf8'))
stageManifest.version = rootManifest.version
writeFileSync(stageManifestPath, `${JSON.stringify(stageManifest, null, 2)}\n`)

for (const required of [
  'lib/main.js',
  'electron-builder.yml',
  'build/icon.svg',
  'node_modules/@deepseek-ai/dsh/lib/bin.js',
]) {
  if (!existsSync(join(stage, required))) {
    throw new Error(`desktop stage is missing ${required}`)
  }
}

process.stdout.write(`desktop stage: ${stage}\n`)
