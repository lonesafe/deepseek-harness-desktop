/** Streaming V3-to-V4 conversion preserves event values and logical coordinates. */

import { SessionFormatError, defineSessionFormatMigration, isSessionFormatJsonObject, sessionFormatCount } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent, SessionFormatEventRun, SessionFormatMigrationContext, SessionFormatMigrationStage, SessionFormatMigrationStageInput } from '@deepseek-ai/dsh-session-format'
import { assertReleasedV3Header } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { assertReleasedV4Header } from './validation.ts'

/** Advance the header generation while retaining recorded approval decisions and all admitted body values. */
export const sessionFormatV3ToV4 = defineSessionFormatMigration({
  name: '@deepseek-ai/dsh-session-format-v3-to-v4',
  fromVersion: 3,
  toVersion: 4,
  migrateHeader(header) {
    assertReleasedV3Header(header)
    return { ...header, version: 4 }
  },
  createStage(input) { return new ReleasedV3ToV4Stage(input) },
  validateTargetHeader: assertReleasedV4Header,
})

class ReleasedV3ToV4Stage implements SessionFormatMigrationStage {
  readonly headerInheritedEventCount?: number
  private eventCount = 0
  private inheritedEventCount: number | undefined
  private lastForeignDeliverySeq: number | undefined

  constructor(private readonly input: SessionFormatMigrationStageInput) {
    assertReleasedV3Header(input.sourceHeader)
    this.inheritedEventCount = input.sourceHeader.isSeeded ? undefined : 0
    const cut = input.sourceInheritedEventCount ?? this.inheritedEventCount
    if (cut !== undefined) this.headerInheritedEventCount = cut
  }

  transformEvent(event: SessionFormatEvent, context: SessionFormatMigrationContext): void {
    if (event.seq !== this.eventCount) throw new SessionFormatError('format v3 source events must be dense')
    if (isSessionFormatJsonObject(event.data)) {
      if (event.type === 'session/end-seed' && event.data['inherited'] === true) {
        if (!this.input.sourceHeader.isSeeded) throw new SessionFormatError('format v3 unseeded Session contains an inherited end-seed marker')
        this.inheritedEventCount = event.seq
      }
      if (event.type === 'session-log-deepseek/delivery-accepted') {
        if (event.data['sessionFormatVersion'] === 4) throw new SessionFormatError('format v3 delivery marker claims target format v4')
        if (event.data['sessionFormatVersion'] === 3 && event.data['sessionId'] !== this.input.sourceHeader.id) {
          this.lastForeignDeliverySeq = event.seq
        }
      }
    }
    this.eventCount += 1
    context.emitEvent(event)
  }

  transformRun(run: SessionFormatEventRun, context: SessionFormatMigrationContext): void {
    for (const event of run.expand()) this.transformEvent(event, context)
  }

  finish(_context: SessionFormatMigrationContext): number {
    const cut = sessionFormatCount(this.inheritedEventCount, 'format v3 inherited end-seed marker')
    if (this.input.sourceInheritedEventCount !== undefined && this.input.sourceInheritedEventCount !== cut) {
      throw new SessionFormatError('format v3 inherited end-seed marker disagrees with its source cut')
    }
    if (this.lastForeignDeliverySeq !== undefined
      && (this.input.sourceHeader.parentSession === undefined || this.lastForeignDeliverySeq >= cut)) {
      throw new SessionFormatError('current-generation delivery marker names the wrong Session')
    }
    return cut
  }
}
