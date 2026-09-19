/** Exercise the shipped Office provider and its external native assets. */
import { readFile, stat, writeFile } from 'node:fs/promises'

export const name = 'python-sdk-office-smoke'
export const inject = ['officeToPdf']

export async function apply(ctx, config) {
  const source = await stat(config.input)
  const version = `${source.size}:${source.mtimeMs}`
  const result = await ctx.officeToPdf.convert({ extension: 'docx', priority: 'foreground', source: {
    key: config.input, version, bytes: source.size,
    read: async (signal, maxBytes) => {
      signal.throwIfAborted()
      const bytes = await readFile(config.input)
      if (bytes.length > maxBytes) throw new Error('Office smoke input exceeds its reserved capacity')
      return { bytes, version }
    },
  } })
  await writeFile(config.output, result.pdf)
  await writeFile(config.result, JSON.stringify({
    missingFonts: result.missingFonts,
    moduleUrl: import.meta.resolve('@deepseek-ai/libreoffice-kit'),
    ...(process.platform === 'darwin' ? {
      nativeModuleUrl: new URL('./lib/native/entry.js', import.meta.resolve('@deepseek-ai/dsh-office-to-pdf/package.json')).href,
    } : {}),
  }))
}
