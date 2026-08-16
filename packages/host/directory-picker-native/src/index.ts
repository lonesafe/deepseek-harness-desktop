/**
 * Native backend of the directory-picker seam: registers `ctx.directoryPicker`
 * with the `native` capability, opening one native OS chooser on the host
 * display per pick (macOS `osascript`, Linux Zenity with a KDialog fallback;
 * Windows opens the modern `IFileOpenDialog` in a spawned child process — a
 * koffi-driven COM conversation on the child's main thread). Only viable when
 * the operator sits at the host's screen; remote deployments compose the
 * browse backend instead.
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
