/** Windows Office binaries carry their release CRT independently of system installation. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { copyWindowsCrt } from '../scripts/windows-crt.mjs'

const directories: string[] = []

afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }) })

function fixture(): { source: string; engine: string } {
  const root = mkdtempSync(join(tmpdir(), 'desktop windows crt-'))
  directories.push(root)
  const source = join(root, 'Microsoft.VC143.CRT')
  const engine = join(root, 'engine')
  mkdirSync(source)
  mkdirSync(engine)
  for (const library of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
    writeFileSync(join(source, library), `release ${library}`)
  }
  return { source, engine }
}

it('supplies both the conversion helper and LibreOffice executable directories', () => {
  const { source, engine } = fixture()
  for (const directory of ['bin', 'program']) {
    mkdirSync(join(engine, directory))
    writeFileSync(join(engine, directory, 'worker.exe'), 'executable fixture')
  }
  expect(copyWindowsCrt(source, engine)).toBe(2)
  for (const directory of ['bin', 'program']) {
    expect(readFileSync(join(engine, directory, 'vcruntime140.dll'), 'utf8')).toBe('release vcruntime140.dll')
  }
})

it('rejects an incomplete release runtime before copying files', () => {
  const { source, engine } = fixture()
  rmSync(join(source, 'msvcp140.dll'))
  expect(() => copyWindowsCrt(source, engine)).toThrow('missing msvcp140.dll')
})

it('rejects an absent engine and preserves an engine-owned library', () => {
  const { source, engine } = fixture()
  expect(() => copyWindowsCrt(source, engine)).toThrow('no executables')
  writeFileSync(join(engine, 'worker.exe'), 'executable fixture')
  writeFileSync(join(engine, 'msvcp140.dll'), 'engine-owned')
  expect(() => copyWindowsCrt(source, engine)).toThrow()
  expect(readFileSync(join(engine, 'msvcp140.dll'), 'utf8')).toBe('engine-owned')
})
