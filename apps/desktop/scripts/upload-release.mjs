import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'

const releaseTag = process.env.GITHUB_REF_NAME
if (releaseTag === undefined || releaseTag === '') {
  throw new Error('GITHUB_REF_NAME is required to upload desktop release assets')
}

const output = resolve(import.meta.dirname, '../../../dist/desktop')
const extensions = new Set(['.AppImage', '.deb', '.dmg', '.exe', '.zip'])
const artifacts = readdirSync(output, { withFileTypes: true })
  .filter(entry => entry.isFile() && extensions.has(extname(entry.name)))
  .map(entry => join(output, entry.name))
  .sort()

if (artifacts.length === 0) throw new Error(`no desktop release artifacts found in ${output}`)

const checksumPath = join(output, `SHA256SUMS-${process.platform}-${process.arch}.txt`)
const checksums = artifacts.map((artifact) => {
  const digest = createHash('sha256').update(readFileSync(artifact)).digest('hex')
  return `${digest}  ${artifact.slice(output.length + 1)}`
})
writeFileSync(checksumPath, `${checksums.join('\n')}\n`)
artifacts.push(checksumPath)

const command = process.platform === 'win32' ? 'gh.exe' : 'gh'
const uploaded = spawnSync(command, ['release', 'upload', releaseTag, ...artifacts, '--clobber'], {
  stdio: 'inherit',
})
if (uploaded.error !== undefined) throw uploaded.error
if (uploaded.status !== 0) process.exit(uploaded.status ?? 1)
