/** Keep LibreOffice workers, prebuilt engines, and their dependencies on the real filesystem. */
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { isAbsolute, join, relative, sep } from 'node:path'
import { selectOfficeEngine } from './libreoffice-engine.ts'

/** pkg applies these exclusions to dependency `files` as well as root asset globs. */
export const OFFICE_ASSET_IGNORES = [
  '**/node_modules/@deepseek-ai/libreoffice-kit/**',
  '**/node_modules/@deepseek-ai/libreoffice-kit-*/**',
  '**/node_modules/@deepseek-ai/dsh-office-to-pdf/lib/native/**',
]

interface PackageManifest {
  name: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  os?: string[]
  cpu?: string[]
}

/**
 * Copy the installed Office dependency tree without changing package contents or executable modes.
 * Harness sidecars require the kit's declared target native engine, or WASM for other targets.
 * macOS also carries the provider's generated adapter and executable outside the virtual filesystem.
 * Missing target engines fail with their package name; missing required dependencies or paths outside the deployed closure also fail.
 * @param staging - Symlink-free deployed Node closure.
 * @param destination - Target-specific Office directory beside the executable; replaced when present.
 * @param target - Node platform and CPU of the executable.
 * @returns Relative package directories included in the sidecar.
 */
export async function copyOfficeSidecar(
  staging: string,
  destination: string,
  target: { platform: string; arch: string },
): Promise<string[]> {
  const entry = join(staging, 'node_modules', '@deepseek-ai', 'libreoffice-kit')
  const manifest = JSON.parse(await readFile(join(entry, 'package.json'), 'utf8')) as PackageManifest
  const engineName = `@deepseek-ai/libreoffice-kit-${selectOfficeEngine(manifest, target)}`
  const packages = new Set<string>()

  async function visit(packageDirectory: string): Promise<void> {
    if (packages.has(packageDirectory)) return
    const relativeDirectory = relative(staging, packageDirectory)
    if (isAbsolute(relativeDirectory) || relativeDirectory === '..' || relativeDirectory.startsWith(`..${sep}`)) {
      throw new Error(`Python Office dependency is outside the deployed closure: ${packageDirectory}`)
    }
    const manifestPath = join(packageDirectory, 'package.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as PackageManifest
    packages.add(packageDirectory)
    const require = createRequire(manifestPath)
    const dependencies = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
      ...Object.keys(manifest.peerDependencies ?? {}),
    ])
    for (const name of dependencies) {
      if (name.startsWith('@deepseek-ai/libreoffice-kit-')) continue
      const optional = manifest.optionalDependencies?.[name] !== undefined
        || manifest.peerDependenciesMeta?.[name]?.optional === true
      const dependencyDirectory = (require.resolve.paths(name) ?? [])
        .map(directory => join(directory, name))
        .find(directory => existsSync(directory))
      if (dependencyDirectory === undefined) {
        if (optional) continue
        throw new Error(`Python Office dependency ${name} required by ${manifest.name} is missing.`)
      }
      if (optional) {
        const dependency = JSON.parse(await readFile(join(dependencyDirectory, 'package.json'), 'utf8')) as PackageManifest
        if (!supports(dependency.os, target.platform) || !supports(dependency.cpu, target.arch)) continue
      }
      await visit(dependencyDirectory)
    }
  }

  await visit(entry)
  const engineDirectory = join(staging, 'node_modules', engineName)
  if (!existsSync(engineDirectory)) throw new Error(`Python Office engine ${engineName} required for ${target.platform}/${target.arch} is missing.`)
  await visit(engineDirectory)
  const provider = join('node_modules', '@deepseek-ai', 'dsh-office-to-pdf')
  const nativeFiles = ['package.json', 'lib/native/entry.js', 'lib/native/manifest.json', 'lib/native/NOTICE', 'lib/native/libreoffice-kit-macos']
  if (target.platform === 'darwin') {
    for (const file of nativeFiles) {
      const path = join(staging, provider, file)
      const info = await stat(path)
      if (!info.isFile()) throw new Error(`Python macOS Office asset is not a file: ${path}`)
      if (process.platform !== 'win32' && file.endsWith('/libreoffice-kit-macos') && !(info.mode & 0o111)) {
        throw new Error(`Python macOS Office helper is not executable: ${path}`)
      }
    }
  }
  await rm(destination, { recursive: true, force: true })
  await mkdir(destination, { recursive: true })
  const directories = [...packages].sort()
  for (const source of directories) {
    const nestedModules = join(source, 'node_modules')
    await cp(source, join(destination, relative(staging, source)), {
      recursive: true,
      filter: path => path !== nestedModules && !path.startsWith(nestedModules + sep),
    })
  }
  const copied = directories.map(directory => relative(staging, directory))
  if (target.platform === 'darwin') {
    await mkdir(join(destination, provider, 'lib/native'), { recursive: true })
    for (const file of nativeFiles) await cp(join(staging, provider, file), join(destination, provider, file))
    copied.push(provider)
  }
  return copied.sort()
}

function supports(values: string[] | undefined, value: string): boolean {
  return values === undefined || (!values.includes(`!${value}`)
    && (values.every(item => item.startsWith('!')) || values.includes(value) || values.includes('any')))
}
