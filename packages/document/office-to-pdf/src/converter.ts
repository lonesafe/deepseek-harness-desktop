/** Select generated adapters for macOS wakeups and ASAR-native filesystem access. */
import { createConverter as createKitConverter, type Converter, type ConverterOptions } from '@deepseek-ai/libreoffice-kit'
import { loadNativeConverter } from './native-converter.ts'

/**
 * Create a converter from installed release assets, without runtime compilation or downloads.
 * Source launches require the declared native build before using Office conversion on macOS.
 * @param options - Validated kit limits and font preferences.
 * @param platform - Operating system whose native engine is selected.
 * @param packageUrl - Installed provider package identity, including virtual ASAR locations.
 * @returns A converter whose cancellation and disposal join the helper process.
 */
export async function createConverter(options: ConverterOptions, platform: NodeJS.Platform = process.platform,
  packageUrl = new URL(import.meta.resolve('@deepseek-ai/dsh-office-to-pdf/package.json'))): Promise<Converter> {
  if (platform !== 'darwin' && !/(^|\/)app\.asar\//u.test(packageUrl.pathname)) return createKitConverter(options)
  return (await loadNativeConverter(new URL('./lib/native/', packageUrl), platform))(options)
}
