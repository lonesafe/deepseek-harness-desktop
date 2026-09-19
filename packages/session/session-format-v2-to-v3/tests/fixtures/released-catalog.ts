/** Released V3 validation stays independent of the installed Session writer. */

import { createSessionFormatCatalog } from '@deepseek-ai/dsh-session-format'
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from '@deepseek-ai/dsh-session-format-v0-to-v1'
import { sessionFormatV1ToV2 } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { assertReleasedV3Header, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec, restoreReleasedV3Artifact, sessionFormatV2ToV3 } from '../../src/index.ts'

const knownEventTypes = new Set(['feedback/message-put', 'feedback/message-delete'])

/** Frozen V0-to-V3 chain for historical migration and native V3 admission assertions. */
export const releasedV3Catalog = createSessionFormatCatalog({
  currentVersion: 3,
  codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec, releasedV3SessionFormatCodec],
  currentEncoder: releasedV3SessionFormatCodec,
  migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3],
  restoreCurrent: artifact => restoreReleasedV3Artifact(artifact, knownEventTypes),
  restoreTransformedCurrent: artifact => restoreReleasedV3Artifact(artifact, knownEventTypes),
  restoreCurrentHeader(value) { assertReleasedV3Header(value); return value },
})
