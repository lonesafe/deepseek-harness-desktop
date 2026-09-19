/** V4 physical records retain the released V3 event encoding. */

import { SessionFormatError, isSessionFormatJsonObject, snapshotSessionFormatJson } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatCodec, SessionFormatCurrentEncoder, SessionFormatHeader } from '@deepseek-ai/dsh-session-format'
import { releasedV3SessionFormatCodec } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { assertReleasedV4Header } from './validation.ts'

/** Physical V4 codec with literal historical versions independent of the installed writer. */
export const releasedV4SessionFormatCodec = Object.freeze({
  version: 4,
  decodeHeader(value) {
    return { ...releasedV3SessionFormatCodec.decodeHeader(v3PhysicalHeader(value)), version: 4 }
  },
  createDecoder(value, recovery) {
    const decoder = releasedV3SessionFormatCodec.createDecoder(v3PhysicalHeader(value), recovery)
    return {
      header: { ...decoder.header, version: 4 },
      decodeRow: decoder.decodeRow.bind(decoder),
      finish: decoder.finish.bind(decoder),
    }
  },
  encodeHeader(header, inheritedEventCount) {
    assertReleasedV4Header(header)
    return { ...releasedV3SessionFormatCodec.encodeHeader({ ...header, version: 3 }, inheritedEventCount), version: 4 }
  },
  encodeEvent: releasedV3SessionFormatCodec.encodeEvent,
} satisfies SessionFormatCodec & SessionFormatCurrentEncoder)

function v3PhysicalHeader(value: unknown): SessionFormatHeader {
  const header = snapshotSessionFormatJson(value, 'format v4 physical header')
  if (!isSessionFormatJsonObject(header) || header['version'] !== 4) {
    throw new SessionFormatError('expected format v4 physical Session header')
  }
  return { ...header, version: 3 } as SessionFormatHeader
}
