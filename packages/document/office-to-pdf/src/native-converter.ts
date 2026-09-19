/** Load generated kit adapters and validate macOS helper assets before conversion. */
import { readFile, stat } from 'node:fs/promises'
import type { createConverter } from '@deepseek-ai/libreoffice-kit'

/**
 * Load a packaged converter entry without launching its native helper.
 * @param directory - Installed adapter directory, including logical ASAR URLs.
 * @param platform - Native engine platform; only macOS requires the compatibility executable.
 * @returns The kit-compatible converter factory; rejects incomplete or incompatible assets.
 */
export async function loadNativeConverter(directory: URL, platform: NodeJS.Platform): Promise<typeof createConverter> {
  const { ConversionError, ENGINE_VERSION } = await import('@deepseek-ai/libreoffice-kit')
  try {
    if (platform === 'darwin') {
      const record: unknown = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'))
      if (record === null || typeof record !== 'object' || !('schemaVersion' in record) || record.schemaVersion !== 1
        || !('kitVersion' in record) || record.kitVersion !== ENGINE_VERSION
        || !('architectures' in record) || !Array.isArray(record.architectures) || !record.architectures.includes(process.arch)) {
        throw new Error('macOS Office helper manifest does not match the installed kit and CPU')
      }
      const executableUrl = new URL('libreoffice-kit-macos', directory)
      executableUrl.pathname = executableUrl.pathname.replace(/(^|\/)app\.asar(?=\/)/u, '$1app.asar.unpacked')
      const executable = await stat(executableUrl)
      if (!executable.isFile() || !(executable.mode & 0o111)) throw new Error('macOS Office helper is not an executable file')
    }
    const adapter = await import(new URL('entry.js', directory).href) as { createConverter: typeof createConverter }
    if (typeof adapter.createConverter !== 'function') throw new Error('Office adapter has no converter factory')
    return adapter.createConverter
  } catch (cause) {
    throw new ConversionError('unavailable', 'Native Office assets are unavailable; run pnpm run build:office-native in a source checkout, or reinstall the application.', { cause })
  }
}
