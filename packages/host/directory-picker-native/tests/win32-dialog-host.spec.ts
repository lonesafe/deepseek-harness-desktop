/** Packaged-worker launch invariants that do not require a Windows host. */

import { describe, expect, it } from 'vitest'
import { dialogWorkerEnvironment } from '../src/win32-dialog-host.ts'

describe('win32 dialog worker host', () => {
  it('forces nested Electron launches into Node mode', () => {
    expect(dialogWorkerEnvironment('Choose', {
      ELECTRON_RUN_AS_NODE: undefined,
      KEEP_ME: 'yes',
    })).toEqual(expect.objectContaining({
      DSH_DIALOG_TITLE: 'Choose',
      ELECTRON_RUN_AS_NODE: '1',
      KEEP_ME: 'yes',
    }))
  })
})
