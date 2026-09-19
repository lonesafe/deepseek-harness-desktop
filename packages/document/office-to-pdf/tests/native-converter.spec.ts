/** Platform selection and refusal of incomplete installed macOS conversion assets. */
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { pathToFileURL } from 'node:url'
import { loadNativeConverter } from '../src/native-converter.ts'

const fixture = { root: '' }

afterEach(async () => {
  if (fixture.root) await rm(fixture.root, { recursive: true, force: true })
  fixture.root = ''
})

async function assets(record: unknown = { schemaVersion: 1, kitVersion: '0.0.1', architectures: [process.arch] }) {
  fixture.root = await mkdtemp(join(tmpdir(), 'dsh-office-adapter-test-'))
  const directory = join(fixture.root, 'lib/native')
  await mkdir(directory, { recursive: true })
  await writeFile(join(fixture.root, 'package.json'), '{"type":"module"}\n')
  await writeFile(join(directory, 'manifest.json'), JSON.stringify(record))
  return directory
}

// Windows does not preserve the POSIX executable mode required by the macOS loader.
it.skipIf(process.platform === 'win32').each([false, true])('loads installed macOS assets with ASAR=%s', async (archived) => {
  const directory = await assets()
  await writeFile(join(directory, 'libreoffice-kit-macos'), 'fixture', { mode: 0o755 })
  await writeFile(join(directory, 'entry.js'), 'export async function createConverter(options) { return { backend: "native", options } }\n')
  const packaged = join(fixture.root, 'app.asar.unpacked/provider/lib/native')
  const logical = packaged.replace('app.asar.unpacked', 'app.asar')
  if (archived) {
    await mkdir(packaged, { recursive: true })
    await mkdir(join(logical, '..'), { recursive: true })
    await rename(join(directory, 'libreoffice-kit-macos'), join(packaged, 'libreoffice-kit-macos'))
    await rename(directory, logical)
  }
  const url = pathToFileURL((archived ? logical : directory) + '/')
  const factory = await loadNativeConverter(url, 'darwin')
  expect(await factory({ timeoutMs: 1234 })).toEqual({ backend: 'native', options: { timeoutMs: 1234 } })
})

it.each([null, 1, {}, { schemaVersion: 2 }, { schemaVersion: 1 },
  { schemaVersion: 1, kitVersion: '0.0.2' }, { schemaVersion: 1, kitVersion: '0.0.1' },
  { schemaVersion: 1, kitVersion: '0.0.1', architectures: 'arm64' },
  { schemaVersion: 1, kitVersion: '0.0.1', architectures: [] },
])('refuses incompatible macOS manifest %j', async (record) => {
  await assets(record)
  await expect(loadNativeConverter(pathToFileURL(join(fixture.root, 'lib/native') + '/'), 'darwin')).rejects.toMatchObject({ code: 'unavailable',
    cause: { message: 'macOS Office helper manifest does not match the installed kit and CPU' } })
})

it('reports the explicit source build requirement when assets are missing', async () => {
  fixture.root = await mkdtemp(join(tmpdir(), 'dsh-office-adapter-test-'))
  const loading = loadNativeConverter(pathToFileURL(join(fixture.root, 'lib/native') + '/'), 'darwin')
  await expect(loading).rejects.toMatchObject({ code: 'unavailable' })
  await expect(loading).rejects.toThrow('build:office-native')
})

it('refuses a directory in place of the executable', async () => {
  const directory = await assets()
  await mkdir(join(directory, 'libreoffice-kit-macos'))
  await expect(loadNativeConverter(pathToFileURL(join(fixture.root, 'lib/native') + '/'), 'darwin')).rejects.toMatchObject({ code: 'unavailable',
    cause: { message: 'macOS Office helper is not an executable file' } })
})

it.skipIf(process.platform === 'win32')('refuses a helper without executable permission', async () => {
  const directory = await assets()
  await writeFile(join(directory, 'libreoffice-kit-macos'), 'fixture', { mode: 0o600 })
  await expect(loadNativeConverter(pathToFileURL(join(fixture.root, 'lib/native') + '/'), 'darwin')).rejects.toMatchObject({ code: 'unavailable',
    cause: { message: 'macOS Office helper is not an executable file' } })
})

it.each(['linux', 'win32'] as const)('loads the %s ASAR adapter without a macOS helper', async (platform) => {
  const directory = await assets()
  await rm(join(directory, 'manifest.json'))
  await writeFile(join(directory, 'entry.js'), 'export async function createConverter() { return { backend: "native" } }\n')
  const factory = await loadNativeConverter(pathToFileURL(directory + '/'), platform)
  expect(await factory()).toEqual({ backend: 'native' })
})

it('refuses an incomplete generated adapter', async () => {
  const directory = await assets()
  await writeFile(join(directory, 'entry.js'), 'export const unrelated = true\n')
  await expect(loadNativeConverter(pathToFileURL(directory + '/'), 'win32')).rejects.toMatchObject({
    code: 'unavailable', cause: { message: 'Office adapter has no converter factory' },
  })
})
