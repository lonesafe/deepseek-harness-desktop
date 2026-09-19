/** V4 admission retains V3 structure and validates current-generation delivery ownership. */

import { SessionFormatError, isSessionFormatJsonObject } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatArtifact, SessionFormatEvent, SessionFormatHeader } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV3Header, restoreReleasedV3Artifact } from '@deepseek-ai/dsh-session-format-v2-to-v3'

/**
 * Validate exact V4 logical metadata using the released header fields.
 * @param header - decoded V4 Session header.
 */
export function assertReleasedV4Header(header: SessionFormatHeader): void {
  if (header.version !== 4) throw new SessionFormatError('expected format v4 header')
  assertReleasedV3Header({ ...header, version: 3 })
}

/**
 * Validate V4 events, relationships, and inherited cut without changing durable values.
 * @param artifact - detached V4 artifact.
 * @param knownEventTypes - event types understood by the installed Session package.
 * @returns the same validated artifact.
 */
export function restoreReleasedV4Artifact(artifact: SessionFormatArtifact, knownEventTypes: ReadonlySet<string>): SessionFormatArtifact {
  assertReleasedV4Header(artifact.header)
  restoreReleasedV3Artifact({
    ...artifact,
    header: { ...artifact.header, version: 3 },
    events: artifact.events.map(deliveryValidationView),
  }, knownEventTypes)
  return artifact
}

function deliveryValidationView(event: SessionFormatEvent): SessionFormatEvent {
  if (event.type !== 'session-log-deepseek/delivery-accepted' || !isSessionFormatJsonObject(event.data)) return event
  const version = event.data['sessionFormatVersion']
  if (version !== 3 && version !== 4) return event
  // The frozen relationship validator compares against V3. Only V4 markers are
  // current in this private view; historical V3 markers must stay historical.
  return { ...event, data: { ...event.data, sessionFormatVersion: version === 4 ? 3 : 2 } }
}
