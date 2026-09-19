/** Operating-system selection preserves the ordinary kit on Windows and Linux. */
import { afterEach, expect, it, vi } from 'vitest'
import { createConverter } from '../src/converter.ts'

const fixture = vi.hoisted(() => ({ create: vi.fn(), load: vi.fn() }))
vi.mock('@deepseek-ai/libreoffice-kit', () => ({ createConverter: fixture.create }))
vi.mock('../src/native-converter.ts', () => ({ loadNativeConverter: fixture.load }))
afterEach(() => { fixture.create.mockReset(); fixture.load.mockReset() })

it('selects the installed platform and package by default', async () => {
  const converter = { backend: 'native' }
  fixture.create.mockResolvedValue(converter)
  fixture.load.mockResolvedValue(fixture.create)
  expect(await createConverter({})).toBe(converter)
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith({})
  expect(fixture.load).toHaveBeenCalledTimes(process.platform === 'darwin' ? 1 : 0)
})

it.each(['linux', 'win32'] as const)('uses the original kit on %s', async (platform) => {
  const converter = { backend: 'native' }
  fixture.create.mockResolvedValue(converter)
  const options = { timeoutMs: 1234 }
  expect(await createConverter(options, platform)).toBe(converter)
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith(options)
  expect(fixture.load).not.toHaveBeenCalled()
})

it('loads the owning package macOS assets and preserves converter options', async () => {
  const converter = { backend: 'native' }
  const create = vi.fn().mockResolvedValue(converter)
  fixture.load.mockResolvedValue(create)
  const options = { timeoutMs: 1234 }
  expect(await createConverter(options, 'darwin')).toBe(converter)
  expect(create).toHaveBeenCalledExactlyOnceWith(options)
  expect(fixture.load).toHaveBeenCalledExactlyOnceWith(new URL('./lib/native/',
    import.meta.resolve('@deepseek-ai/dsh-office-to-pdf/package.json')), 'darwin')
  expect(fixture.create).not.toHaveBeenCalled()
})

it.each(['linux', 'win32'] as const)('uses physical-asset adapter for %s ASAR installs', async (platform) => {
  const create = vi.fn().mockResolvedValue({ backend: 'native' })
  fixture.load.mockResolvedValue(create)
  const packageUrl = new URL('file:///installed/app.asar/node_modules/provider/package.json')
  await createConverter({}, platform, packageUrl)
  expect(fixture.load).toHaveBeenCalledExactlyOnceWith(new URL('./lib/native/', packageUrl), platform)
  expect(fixture.create).not.toHaveBeenCalled()
})

it('does not treat similarly named ordinary directories as ASAR archives', async () => {
  await createConverter({}, 'win32', new URL('file:///installed/my-app.asar/provider/package.json'))
  expect(fixture.create).toHaveBeenCalledExactlyOnceWith({})
  expect(fixture.load).not.toHaveBeenCalled()
})
