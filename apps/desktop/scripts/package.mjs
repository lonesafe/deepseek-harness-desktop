import { rebuild } from '@electron/rebuild'
import { archFromString, build, Platform } from 'electron-builder'
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(appDir, '../..')
const stage = resolve(root, 'dist/desktop-stage')
const require = createRequire(import.meta.url)
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

const expectedHost = ({ mac: 'darwin', linux: 'linux', windows: 'win32' })[platformName]
if (expectedHost !== process.platform) {
  throw new Error(`desktop native packaging for ${platformName} must run on ${String(expectedHost)}, got ${process.platform}`)
}

const electronManifest = JSON.parse(readFileSync(require.resolve('electron/package.json'), 'utf8'))
const electronVersion = electronManifest.version
const fsExt = realpathSync(join(stage, 'node_modules', '.pnpm', 'node_modules', 'fs-ext'))
process.stdout.write(`desktop native rebuild: fs-ext for Electron ${electronVersion} ${process.platform}-${archName}\n`)
await rebuild({
  buildPath: fsExt,
  electronVersion,
  arch: archName,
  force: true,
  buildFromSource: true,
  mode: 'sequential',
})

const electronExecutable = require('electron')
function probeNativeAddon(executable, modulePath, label) {
  const probe = spawnSync(executable, [
    '-e',
    `require(${JSON.stringify(modulePath)}); process.stdout.write(process.versions.modules)`,
  ], {
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  })
  if (probe.error !== undefined) throw probe.error
  if (probe.status !== 0) {
    throw new Error(`${label} failed to load rebuilt fs-ext:\n${probe.stderr}`)
  }
  process.stdout.write(`${label}: fs-ext ABI ${probe.stdout.trim()} loaded\n`)
}
probeNativeAddon(electronExecutable, fsExt, 'desktop staged native probe')

/**
 * electron-builder flattens pnpm's deployment tree from the workspace and can
 * replace the staged addon with the host-Node build. Restore the already
 * verified Electron build after copying dependencies and before signing and
 * producing installers, then verify the actual packaged runtime as a gate.
 */
async function preservePackagedNativeAddon(context) {
  const productFilename = context.packager.appInfo.productFilename
  const appRoot = platformName === 'mac'
    ? join(context.appOutDir, `${productFilename}.app`)
    : context.appOutDir
  const resources = platformName === 'mac'
    ? join(appRoot, 'Contents', 'Resources')
    : join(appRoot, 'resources')
  const executable = platformName === 'mac'
    ? join(appRoot, 'Contents', 'MacOS', productFilename)
    : platformName === 'windows'
      ? join(appRoot, `${productFilename}.exe`)
      : join(appRoot, 'deepseek-harness')
  const packagedFsExt = join(resources, 'app', 'node_modules', 'fs-ext')
  const sourceBinary = join(fsExt, 'build', 'Release', 'fs_ext.node')
  const packagedBinary = join(packagedFsExt, 'build', 'Release', 'fs_ext.node')
  if (!existsSync(sourceBinary) || !existsSync(packagedBinary) || !existsSync(executable)) {
    throw new Error('packaged desktop runtime is missing fs-ext or its Electron executable')
  }
  copyFileSync(sourceBinary, packagedBinary)
  probeNativeAddon(executable, packagedFsExt, 'desktop packaged native probe')
}

const electronDist = process.env.DSH_ELECTRON_DIST

const artifacts = await build({
  projectDir: stage,
  publish: 'never',
  targets: platform.createTarget(undefined, archFromString(archName)),
  config: {
    afterPack: preservePackagedNativeAddon,
    ...(electronDist === undefined ? {} : { electronDist: resolve(electronDist) }),
  },
})
for (const artifact of artifacts) process.stdout.write(`desktop artifact: ${artifact}\n`)
