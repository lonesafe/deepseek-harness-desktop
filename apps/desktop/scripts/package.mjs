import { archFromString, build, Platform } from 'electron-builder'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyDesktopNativeRuntime } from './native-runtime.mjs'

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

const electronExecutable = require('electron')
verifyDesktopNativeRuntime(electronExecutable, stage, 'desktop staged native probe')

/**
 * electron-builder flattens pnpm's deployment tree. Verify the copied native
 * dependencies with the packaged Electron executable before signing.
 */
async function verifyPackagedNativeRuntime(context) {
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
  verifyDesktopNativeRuntime(executable, join(resources, 'app'), 'desktop packaged native probe')
}

const electronDist = process.env.DSH_ELECTRON_DIST

const artifacts = await build({
  projectDir: stage,
  publish: 'never',
  targets: platform.createTarget(undefined, archFromString(archName)),
  config: {
    afterPack: verifyPackagedNativeRuntime,
    ...(electronDist === undefined ? {} : { electronDist: resolve(electronDist) }),
  },
})
for (const artifact of artifacts) process.stdout.write(`desktop artifact: ${artifact}\n`)
