/** Bundle the release MSVC runtime beside the Windows Office executables. */
import { execFileSync } from 'node:child_process'
import { constants, copyFileSync, existsSync, globSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative } from 'node:path'

/**
 * Copy release CRT libraries into each executable directory of an installed engine.
 * @param {string} source Visual Studio's architecture-specific Microsoft.VC*.CRT directory.
 * @param {string} engineRoot Deployed Office engine package, never the workspace package store.
 * @returns {number} Number of executable directories supplied with the runtime.
 */
export function copyWindowsCrt(source, engineRoot) {
  const libraries = readdirSync(source).filter(name => name.endsWith('.dll'))
  for (const required of ['msvcp140.dll', 'vcruntime140.dll', 'vcruntime140_1.dll']) {
    if (!libraries.includes(required)) throw new Error(`desktop Windows CRT: missing ${required} in ${source}`)
  }
  const directories = new Set([...globSync('**/*.exe', { cwd: engineRoot })].map(path => dirname(join(engineRoot, path))))
  if (directories.size === 0) throw new Error('desktop Windows CRT: Office engine has no executables')
  for (const directory of directories) {
    for (const library of libraries) copyFileSync(join(source, library), join(directory, library), constants.COPYFILE_EXCL)
  }
  return directories.size
}

/**
 * Locate the build host's redistributable release CRT and stage it with Office.
 * @param {string} applicationRoot Completed production deployment directory.
 * @returns {void} Throws when the native engine or Visual Studio redist is missing.
 */
export function stageWindowsCrt(applicationRoot) {
  const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
    'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  const installation = execFileSync(vswhere, [
    '-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath',
  ], { encoding: 'utf8', timeout: 30_000 }).trim()
  if (installation === '') throw new Error('desktop Windows CRT: Visual Studio C++ Build Tools are required')
  const redist = join(installation, 'VC', 'Redist', 'MSVC')
  const versions = readdirSync(redist).filter(name => /^\d+\.\d+\.\d+$/.test(name))
    .sort((left, right) => right.localeCompare(left, 'en', { numeric: true }))
  const candidates = versions.flatMap(version => [...globSync(`*/Microsoft.VC*.CRT`, { cwd: join(redist, version) })]
    .filter(path => dirname(path) === process.arch).map(path => join(redist, version, path)))
  const source = candidates.find(path => existsSync(join(path, 'vcruntime140.dll')))
  if (source === undefined) throw new Error(`desktop Windows CRT: no release runtime for ${process.arch}`)
  const desktop = createRequire(join(applicationRoot, 'package.json'))
  const cli = createRequire(desktop.resolve('@deepseek-ai/dsh/package.json'))
  const web = createRequire(cli.resolve('@deepseek-ai/dsh-web-app/package.json'))
  const kit = createRequire(web.resolve('@deepseek-ai/libreoffice-kit/package.json'))
  const engine = dirname(kit.resolve(`@deepseek-ai/libreoffice-kit-win32-${process.arch}/package.json`))
  const local = relative(realpathSync(applicationRoot), realpathSync(engine))
  if (local === '..' || local.startsWith('..\\') || local.startsWith('../') || isAbsolute(local)) {
    throw new Error('desktop Windows CRT: engine resolves outside the deployed application')
  }
  const directories = copyWindowsCrt(source, engine)
  process.stdout.write(`desktop Windows CRT: supplied ${directories} Office executable directories\n`)
}
