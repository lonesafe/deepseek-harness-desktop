import { archFromString, build, Platform } from 'electron-builder'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(appDir, '../..')
const stage = resolve(root, 'dist/desktop-stage')
const platformName = process.argv[2] ?? ({ darwin: 'mac', linux: 'linux', win32: 'windows' })[process.platform]
const archName = process.argv[3] ?? process.arch
const platform = ({
  mac: Platform.MAC,
  linux: Platform.LINUX,
  windows: Platform.WINDOWS,
})[platformName]

if (platform === undefined) {
  throw new Error(`usage: package.mjs <mac|linux|windows> [x64|arm64], got ${String(platformName)}`)
}

const artifacts = await build({
  projectDir: stage,
  targets: platform.createTarget(undefined, archFromString(archName)),
})
for (const artifact of artifacts) process.stdout.write(`desktop artifact: ${artifact}\n`)
