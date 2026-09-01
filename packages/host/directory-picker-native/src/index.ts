/**
 * Attended-desktop backend of the directory-picker seam: registers the stable
 * `adaptive` capability, opening a native OS chooser for loopback pages and
 * serving browse operations to authenticated remote pages. Native selection
 * uses macOS `osascript`, Linux Zenity with a KDialog fallback, or a spawned
 * Windows `IFileOpenDialog` child process.
 * @module @deepseek-ai/dsh-host-directory-picker-native
 */

import { DirectoryPicker } from '@deepseek-ai/dsh-host-directory-picker'
import type { DirectoryPickerCapability } from '@deepseek-ai/dsh-host-directory-picker'
import { createBrowseDirectoryCapability } from '@deepseek-ai/dsh-host-directory-picker-browse'
import { pickNativeDirectory } from './native-picker.ts'

export type { DirectoryPickerInternals, DirectoryPickerRunner } from './native-picker.ts'
export { pickNativeDirectory } from './native-picker.ts'

/** Desktop implementation serving native loopback and browser-based remote selection together. */
export default class NativeDirectoryPicker extends DirectoryPicker {
  private readonly browseCapability = createBrowseDirectoryCapability()
  private readonly adaptiveCapability: DirectoryPickerCapability = {
    kind: 'adaptive',
    /* v8 ignore next -- pure forward to pickNativeDirectory (its spec owns behavior); invoking here opens a real chooser. */
    pick: signal => pickNativeDirectory(signal),
    list: (path, signal) => this.browseCapability.list(path, signal),
    createDirectory: (path, name) => this.browseCapability.createDirectory(path, name),
  }

  /**
   * The desktop interaction capability.
   * @returns the stable `adaptive` capability object.
   */
  capability(): DirectoryPickerCapability {
    return this.adaptiveCapability
  }
}
