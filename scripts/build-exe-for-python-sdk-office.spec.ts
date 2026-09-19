import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { copyOfficeSidecar } from './build-exe-for-python-sdk-office.ts'

const temporaryDirectories: string[] = []
const macosAssets = ['lib/native/entry.js', 'lib/native/manifest.json', 'lib/native/NOTICE', 'lib/native/libreoffice-kit-macos']

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-python-office-'))
  temporaryDirectories.push(root)
  const staging = join(root, 'staging')
  const destination = join(root, 'runtime-office')
  async function packageAt(name: string, fields: Record<string, unknown> = {}, parent = staging) {
    const directory = join(parent, 'node_modules', name)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...fields }))
    return directory
  }
  async function macosAdapter() {
    const directory = await packageAt('@deepseek-ai/dsh-office-to-pdf', { dependencies: { 'provider-only': '1' } })
    for (const asset of macosAssets) {
      await mkdir(dirname(join(directory, asset)), { recursive: true })
      await writeFile(join(directory, asset), asset)
    }
    await chmod(join(directory, 'lib/native/libreoffice-kit-macos'), 0o755)
    await writeFile(join(directory, 'lib/index.js'), 'provider stays in the executable')
    return directory
  }
  return { root, staging, destination, packageAt, macosAdapter }
}

it('copies package-owned data, licenses, helper permissions, and nested dependencies', async () => {
  const { staging, destination, packageAt } = await fixture()
  const entry = await packageAt('@deepseek-ai/libreoffice-kit', { optionalDependencies: { '@deepseek-ai/libreoffice-kit-wasm': '0.0.1' }, dependencies: { decoder: '1' } })
  const engine = await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  const decoder = await packageAt('decoder', { dependencies: { codec: '1' } }, entry)
  await packageAt('codec', {}, decoder)
  await packageAt('codec', { version: '2.0.0' })
  const assets = ['assets/soffice.data', 'prebuilds.json', 'licenses/LICENSE', 'bin/helper']
  for (const name of assets) {
    const path = join(engine, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, name)
  }
  await chmod(join(engine, 'bin/helper'), 0o755)

  const packages = await copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' })

  expect(packages).toHaveLength(4)
  expect(await readFile(join(destination, 'node_modules/@deepseek-ai/libreoffice-kit-wasm/assets/soffice.data'), 'utf8')).toBe('assets/soffice.data')
  expect(await readFile(join(destination, 'node_modules/@deepseek-ai/libreoffice-kit-wasm/licenses/LICENSE'), 'utf8')).toBe('licenses/LICENSE')
  expect(await readFile(join(destination, 'node_modules/@deepseek-ai/libreoffice-kit/node_modules/decoder/node_modules/codec/package.json'), 'utf8')).toContain('codec')
  await expect(stat(join(destination, 'node_modules/codec'))).rejects.toMatchObject({ code: 'ENOENT' })
  if (process.platform !== 'win32') expect((await stat(join(destination, 'node_modules/@deepseek-ai/libreoffice-kit-wasm/bin/helper'))).mode & 0o111).toBe(0o111)
})

it('copies installed target optionals and leaves other platforms and absent optionals out', async () => {
  const { staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', {
    optionalDependencies: { native: '1', foreign: '1', absent: '1' },
  })
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  await packageAt('native', { os: ['linux'], cpu: ['x64'] })
  await packageAt('foreign', { os: ['darwin'], cpu: ['arm64'] })

  const packages = await copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' })

  expect(packages.map(path => path.replaceAll('\\', '/'))).toEqual([
    'node_modules/@deepseek-ai/libreoffice-kit',
    'node_modules/@deepseek-ai/libreoffice-kit-wasm',
    'node_modules/native',
  ])
})

it('rejects a missing required dependency before producing a sidecar', async () => {
  const { staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', { dependencies: { 'dsh-missing-office-fixture': '1' } })

  await expect(copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' }))
    .rejects.toThrow('dsh-missing-office-fixture required by @deepseek-ai/libreoffice-kit is missing')
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects an incomplete installed optional instead of omitting it', async () => {
  const { staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', { optionalDependencies: { broken: '1' } })
  await mkdir(join(staging, 'node_modules/broken'), { recursive: true })

  await expect(copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' }))
    .rejects.toMatchObject({ code: 'ENOENT' })
})

it('rejects an ancestor dependency outside the deployed closure', async () => {
  const { root, staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', { dependencies: { 'ancestor-office-fixture': '1' } })
  await packageAt('ancestor-office-fixture', {}, root)

  await expect(copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' }))
    .rejects.toThrow('outside the deployed closure')
})

it('requires the declared WASM engine inside the deployed closure', async () => {
  const { root, staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', { optionalDependencies: { '@deepseek-ai/libreoffice-kit-wasm': '0.0.1' } })
  await packageAt('@deepseek-ai/libreoffice-kit-wasm', {}, root)
  await expect(copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' }))
    .rejects.toThrow('Python Office engine @deepseek-ai/libreoffice-kit-wasm required for linux/x64 is missing.')
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.each([
  ['darwin', 'arm64', 'darwin-arm64'], ['darwin', 'x64', 'darwin-x64'],
  ['win32', 'arm64', 'win32-arm64'], ['win32', 'x64', 'win32-x64'],
  ['linux', 'x64', 'linux-x64'], ['linux', 'arm64', 'wasm'], ['freebsd', 'x64', 'wasm'],
])('copies only the %s/%s engine even when other engines are staged', async (platform, arch, selected) => {
  const { staging, destination, packageAt, macosAdapter } = await fixture()
  const targets = ['darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-x64', 'linux-x64', 'wasm']
  const names = targets.map(target => `@deepseek-ai/libreoffice-kit-${target}`)
  await packageAt('@deepseek-ai/libreoffice-kit', { optionalDependencies: Object.fromEntries(names.map(name => [name, '0.0.1'])) })
  for (const name of names) await packageAt(name)
  if (platform === 'darwin') await macosAdapter()
  const expected = `@deepseek-ai/libreoffice-kit-${selected}`
  const packages = await copyOfficeSidecar(staging, destination, { platform, arch })
  expect(packages.map(path => path.replaceAll('\\', '/'))).toEqual([
    ...(platform === 'darwin' ? ['node_modules/@deepseek-ai/dsh-office-to-pdf'] : []),
    'node_modules/@deepseek-ai/libreoffice-kit', `node_modules/${expected}`,
  ])
})

it('copies macOS provider assets and executable mode without externalizing the provider', async () => {
  const { staging, destination, packageAt, macosAdapter } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit')
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  const source = await macosAdapter()
  await copyOfficeSidecar(staging, destination, { platform: 'darwin', arch: 'arm64' })
  const copied = join(destination, 'node_modules/@deepseek-ai/dsh-office-to-pdf')
  for (const asset of ['package.json', ...macosAssets]) {
    expect(await readFile(join(copied, asset))).toEqual(await readFile(join(source, asset)))
  }
  await expect(stat(join(copied, 'lib/index.js'))).rejects.toMatchObject({ code: 'ENOENT' })
  if (process.platform !== 'win32') expect((await stat(join(copied, 'lib/native/libreoffice-kit-macos'))).mode & 0o111).toBe(0o111)
})

it.each(['package.json', ...macosAssets])('rejects the missing macOS asset %s before producing a sidecar', async (asset) => {
  const { staging, destination, packageAt, macosAdapter } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit')
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  const source = await macosAdapter()
  await rm(join(source, asset))
  await expect(copyOfficeSidecar(staging, destination, { platform: 'darwin', arch: 'arm64' }))
    .rejects.toMatchObject({ code: 'ENOENT', path: join(source, asset) })
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it.skipIf(process.platform === 'win32')('rejects a macOS helper without executable permission', async () => {
  const { staging, destination, packageAt, macosAdapter } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit')
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  const source = await macosAdapter()
  await chmod(join(source, 'lib/native/libreoffice-kit-macos'), 0o644)
  await expect(copyOfficeSidecar(staging, destination, { platform: 'darwin', arch: 'arm64' }))
    .rejects.toThrow('Python macOS Office helper is not executable')
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('resolves the macOS adapter from the relocated sidecar through the executable bootstrap', async () => {
  const { root, staging, packageAt, macosAdapter } = await fixture()
  const executable = join(root, 'relocated-runtime')
  const destination = `${executable}-office`
  const kit = await packageAt('@deepseek-ai/libreoffice-kit', { type: 'module', main: 'index.js' })
  await writeFile(join(kit, 'index.js'), 'export const identity = "sidecar kit"')
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  const provider = await macosAdapter()
  const manifest = { name: '@deepseek-ai/dsh-office-to-pdf', type: 'module', exports: { './package.json': './package.json' } }
  await writeFile(join(provider, 'package.json'), JSON.stringify(manifest))
  await writeFile(join(provider, 'lib/native/entry.js'), 'export const identity = "sidecar adapter"')
  await copyOfficeSidecar(staging, destination, { platform: 'darwin', arch: 'arm64' })
  const virtualProvider = await packageAt('@deepseek-ai/dsh-office-to-pdf', manifest, join(root, 'virtual'))
  const probe = join(virtualProvider, 'probe.mjs')
  const expected = pathToFileURL(await realpath(join(destination, 'node_modules/@deepseek-ai/dsh-office-to-pdf/package.json'))).href
  await writeFile(probe, `import assert from 'node:assert/strict'
export async function runCli() {
  assert.equal(import.meta.resolve('@deepseek-ai/dsh-office-to-pdf/package.json'), ${JSON.stringify(expected)})
  assert.equal((await import('@deepseek-ai/libreoffice-kit')).identity, 'sidecar kit')
  const adapter = new URL('./lib/native/entry.js', import.meta.resolve('@deepseek-ai/dsh-office-to-pdf/package.json'))
  assert.equal((await import(adapter.href)).identity, 'sidecar adapter')
}
`)
  const bootstrap = new URL('../python/sdk-runtime/runtime-bootstrap.mjs', import.meta.url).href
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
import { registerHooks } from 'node:module'
Object.defineProperty(process, 'execPath', { value: ${JSON.stringify(executable)} })
Object.defineProperty(process, 'platform', { value: 'darwin' })
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'node:sea') return { url: 'data:text/javascript,export function isSea(){return true}', shortCircuit: true }
  if (specifier === '@deepseek-ai/dsh/lib/bin.js') return { url: ${JSON.stringify(pathToFileURL(probe).href)}, shortCircuit: true }
  return nextResolve(specifier, context)
} })
await import(${JSON.stringify(bootstrap)})
`], { encoding: 'utf8', timeout: 10_000, env: { ...process.env, DSH_SUBPROCESS_RUNNER: undefined, DSH_PTC_RUNTIME_NODE: undefined } })
  expect(result.error).toBeUndefined()
  expect(result.stderr).toBe('')
  expect(result.status).toBe(0)
})

it.each(['darwin', 'win32', 'linux'])('%s requires its native package even when WASM is staged', async (platform) => {
  const { staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit', { optionalDependencies: {
    '@deepseek-ai/libreoffice-kit-wasm': '0.0.1', [`@deepseek-ai/libreoffice-kit-${platform}-arm64`]: '0.0.1',
  } })
  await packageAt('@deepseek-ai/libreoffice-kit-wasm')
  await expect(copyOfficeSidecar(staging, destination, { platform, arch: 'arm64' }))
    .rejects.toThrow(`Python Office engine @deepseek-ai/libreoffice-kit-${platform}-arm64 required for ${platform}/arm64 is missing.`)
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})

it('requires a staged Linux WASM engine even when an ancestor has one', async () => {
  const { root, staging, destination, packageAt } = await fixture()
  await packageAt('@deepseek-ai/libreoffice-kit')
  await packageAt('@deepseek-ai/libreoffice-kit-wasm', {}, root)
  await expect(copyOfficeSidecar(staging, destination, { platform: 'linux', arch: 'x64' }))
    .rejects.toThrow('Python Office engine @deepseek-ai/libreoffice-kit-wasm required for linux/x64 is missing.')
  await expect(stat(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})
