/** V4 restores released generations without changing V3 approval history or coordinates. */

import { describe, expect, it } from 'vitest'
import { createSessionFormatCatalog, SessionFormatEventCollector } from '@deepseek-ai/dsh-session-format'
import type { SessionFormatEvent, SessionFormatHeader, SessionFormatJsonValue, SessionFormatRecovery } from '@deepseek-ai/dsh-session-format'
import { releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, sessionFormatV0ToV1 } from '@deepseek-ai/dsh-session-format-v0-to-v1'
import { releasedV2SessionFormatCodec, sessionFormatV1ToV2 } from '@deepseek-ai/dsh-session-format-v1-to-v2'
import { sessionFormatV2ToV3 } from '@deepseek-ai/dsh-session-format-v2-to-v3'
import { assertReleasedV4Header, releasedV3SessionFormatCodec, releasedV4SessionFormatCodec, restoreReleasedV4Artifact, sessionFormatV3ToV4 } from '../src/index.ts'

const header: SessionFormatHeader = {
  version: 3, id: 'remembered-approval', createdAt: 1, isSeeded: false, delegationDepth: 0,
}
const catalog = createSessionFormatCatalog({
  currentVersion: 4,
  migrations: [sessionFormatV0ToV1, sessionFormatV1ToV2, sessionFormatV2ToV3, sessionFormatV3ToV4],
  codecs: [releasedV0SessionFormatCodec, releasedV1SessionFormatCodec, releasedV2SessionFormatCodec,
    releasedV3SessionFormatCodec, releasedV4SessionFormatCodec],
  currentEncoder: releasedV4SessionFormatCodec,
  restoreCurrentHeader(value) { assertReleasedV4Header(value); return value },
  restoreCurrent: value => restoreReleasedV4Artifact(value, new Set(['fork/known'])),
  restoreTransformedCurrent: value => restoreReleasedV4Artifact(value, new Set(['fork/known'])),
})

function event(type: string, seq: number, data: SessionFormatJsonValue, extra = {}): SessionFormatEvent {
  return { type, seq, time: seq + 10, data, ...extra }
}

function restore(rows: readonly unknown[], source = header, recovery: SessionFormatRecovery = 'strict') {
  const reader = catalog.createRestore({ type: 'session', ...source }, { recovery, validation: 'current' })
  for (const row of rows) reader.decodeRow(row)
  return reader.finish()
}

function stage(source = header, cut: number | undefined = source.isSeeded ? undefined : 0) {
  return sessionFormatV3ToV4.createStage({
    sourceHeader: source, targetHeader: sessionFormatV3ToV4.migrateHeader(source),
    sourceInheritedEventCount: cut, sourceKind: 'decoded',
  })
}

const approvals = [
  event('approval/asked', 0, { id: 'approval', toolName: 'bash', alwaysAllowKey: 'sandbox:bash:workspace-write' }),
  event('approval/decided', 1, { id: 'approval', outcome: 'allowed-always' }),
]

describe('V3-to-V4 body preservation', () => {
  it('preserves remembered grants, opaque payloads, header metadata, order, and the inherited cut on repeat restores', () => {
    const source = {
      ...header, cwd: '/workspace', agentPreset: 'code', parentSession: 'parent', origin: 'subagent' as const,
      isSeeded: true, delegationDepth: 2,
    }
    const rows = [
      ...approvals,
      event('session/end-seed', 2, { inherited: true }),
      event('external/event', 3, { seq: 42, capturedFormatVersion: 3 }, { ignorable: true }),
      event('fork/known', 4, { nested: ['allowed-always', 3] }),
    ]
    const before = JSON.stringify({ source, rows })
    const expected = { header: { ...source, version: 4 }, inheritedEventCount: 2, events: rows }
    expect(restore(rows, source)).toEqual(expected)
    expect(restore(rows, source)).toEqual(expected)
    expect(JSON.stringify({ source, rows })).toBe(before)
    const physical = releasedV4SessionFormatCodec.encodeHeader(expected.header, expected.inheritedEventCount)
    const reader = catalog.createRestore(physical, { recovery: 'strict', validation: 'current' })
    for (const row of rows) reader.decodeRow(releasedV4SessionFormatCodec.encodeEvent(row))
    expect(reader.finish()).toEqual(expected)
  })

  it('retains system heads, replacement endpoints, message ids, and source references', () => {
    const user = { id: 'user', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'input' }] }
    const rows = [
      event('turn/start', 0, { turn: 1 }),
      event('step/start', 1, { turn: 1, step: 1 }),
      event('system/message', 2, { turn: 1, step: 1, message: { id: 'system', role: 'system', source: { kind: 'plugin', plugin: 'context' }, content: [] } }, { surfaceOp: 'append' }),
      event('user/message', 3, user, { surfaceOp: 'append' }),
      event('user/message', 4, { ...user, id: 'replacement' }, { surfaceOp: { op: 'replace', startSeq: 3, endSeq: 3 }, sourceEventSeqs: [3] }),
    ]
    expect(restore(rows).events).toEqual(rows)
    const shadowHead = { ...rows[4]!, surfaceOp: { op: 'replace', startSeq: 2, endSeq: 2 }, sourceEventSeqs: [2] }
    expect(() => restore([...rows.slice(0, 4), shadowHead])).toThrow(/protected/)
  })

  it.each([0, 1, 2])('retains the derived inherited cut after earlier stages transform V%s', (version) => {
    const physical = {
      type: 'session', version, id: 'seeded-chain', createdAt: 1, delegationDepth: 0,
      ...(version === 2 ? { isSeeded: true } : { seedLength: 3 }),
    }
    const rows = [
      event('turn/start', 0, { turn: 1 }),
      event('step/start', 1, { turn: 1, step: 1 }),
      event('feedback/record', 2, { text: 'inherited' }),
      event('session/end-seed', 3, version === 2 ? { inherited: true } : {}),
    ]
    const reader = catalog.createRestore(physical, { recovery: 'strict', validation: 'current' })
    for (const row of rows) reader.decodeRow(row)
    const output = reader.finish()
    expect(output.header.version).toBe(4)
    expect(output.inheritedEventCount).toBe(4)
    expect(output.events[2]?.type).toBe('system/message')
    expect(output.events.at(-1)).toEqual({ ...rows[3], seq: 4, data: { inherited: true } })
  })

  it('keeps interleaved stages independent and derives an unknown cut from an expanded run', () => {
    const seeded = stage({ ...header, isSeeded: true }, undefined)
    const local = stage()
    const inherited = new SessionFormatEventCollector()
    const ordinary = new SessionFormatEventCollector()
    const rows = [...approvals, event('session/end-seed', 2, { inherited: true })]
    expect(seeded.headerInheritedEventCount).toBeUndefined()
    expect(local.headerInheritedEventCount).toBe(0)
    local.transformEvent(approvals[0]!, ordinary)
    seeded.transformRun({ runType: 'fixture', firstSeq: 0, eventCount: rows.length, expand: () => rows }, inherited)
    local.transformEvent(approvals[1]!, ordinary)
    expect(seeded.finish(inherited)).toBe(2)
    expect(local.finish(ordinary)).toBe(0)
    expect(inherited.values).toEqual(rows)
    expect(ordinary.values).toEqual(approvals)
  })

  it('rejects sparse stage input and inconsistent or missing seed markers', () => {
    const output = new SessionFormatEventCollector()
    expect(() => { stage().transformEvent(approvals[1]!, output) }).toThrow(/dense/)
    const marker = event('session/end-seed', 0, { inherited: true })
    expect(() => { stage().transformEvent(marker, output) }).toThrow(/unseeded/)
    expect(() => stage({ ...header, isSeeded: true }, undefined).finish(output)).toThrow(/inherited end-seed marker/)
    const mismatch = stage({ ...header, isSeeded: true }, 1)
    mismatch.transformEvent(marker, output)
    expect(() => mismatch.finish(output)).toThrow(/disagrees/)
  })
})

describe('V4 decoding and admission', () => {
  it('classifies headers without body access and rejects other generations or malformed fields', () => {
    expect(catalog.readHeader({ type: 'session', ...header })).toMatchObject({ status: 'migration-required', storedVersion: 3, targetVersion: 4 })
    expect(releasedV4SessionFormatCodec.decodeHeader({ type: 'session', ...header, version: 4 })).toEqual({ ...header, version: 4 })
    expect(() => releasedV4SessionFormatCodec.decodeHeader({ type: 'session', ...header })).toThrow(/v4 physical/)
    expect(() => releasedV4SessionFormatCodec.decodeHeader(null)).toThrow(/v4 physical/)
    expect(() => { assertReleasedV4Header(header) }).toThrow(/v4 header/)
    expect(() => sessionFormatV3ToV4.migrateHeader({ ...header, version: 4 })).toThrow(/v3 header/)
    expect(() => { assertReleasedV4Header({ ...header, version: 4, cwd: 'relative' }) }).toThrow(/absolute/)
    expect(() => releasedV4SessionFormatCodec.encodeHeader({ ...header, version: 4 }, 1)).toThrow(/unseeded/)
  })

  it.each([3, 4])('refuses unknown required and malformed events from V%s while retaining ignorable events', (version) => {
    expect(() => restore([event('external/event', 0, null)], { ...header, version })).toThrow(/unknown event type/)
    expect(() => restore([event('feedback/record', 1, { text: 'gap' })], { ...header, version })).toThrow(/seq gap/)
    const opaque = event('external/event', 0, null, { ignorable: true })
    expect(restore([opaque], { ...header, version }).events).toEqual([opaque])
    expect(() => restore([event('tool/code-dispatch', 0, {})], { ...header, version }, 'recoverable')).toThrow(/unknown event type/)
    expect(() => restore([event('request/header', 0, { header: { system: '' } })], { ...header, version }, 'recoverable')).toThrow(/retired/)
  })

  it('keeps recoverable tail policy and accepted inherited cut from the frozen decoder', () => {
    const rows = [...approvals, event('session/end-seed', 2, { inherited: true })]
    const decoder = releasedV4SessionFormatCodec.createDecoder({ type: 'session', ...header, version: 4, isSeeded: true }, 'recoverable')
    const output = new SessionFormatEventCollector()
    for (const row of rows) decoder.decodeRow(row, output)
    decoder.decodeRow({ bad: true }, output)
    decoder.decodeRow(event('session/end-seed', 4, { inherited: true }), output)
    expect(decoder.finish(output)).toBe(2)
    expect(output.values).toEqual(rows)
    expect(() => { decoder.decodeRow(event('turn/end', 5, { turn: 1, reason: { kind: 'completed' } }), output) }).toThrow(/required field/)
  })
})

describe('delivery generation ownership', () => {
  const delivery = (version: number, sessionId = header.id) => event('session-log-deepseek/delivery-accepted', 2, { sessionId, throughSeq: 1, sessionFormatVersion: version })

  it('preserves V3 delivery coordinates and refuses activation of a target-generation marker', () => {
    const rows = [...approvals, delivery(3)]
    expect(restore(rows).events).toEqual(rows)
    expect(() => restore([...approvals, delivery(4)])).toThrow(/claims target format v4/)
    expect(() => restore([...approvals, delivery(3, 'foreign')])).toThrow(/wrong Session/)
  })

  it('admits foreign source markers only within an inherited prefix with a parent', () => {
    const rows = [...approvals, delivery(3, 'parent'), event('session/end-seed', 3, { inherited: true })]
    expect(restore(rows, { ...header, isSeeded: true, parentSession: 'parent' }).events).toEqual(rows)
    expect(() => restore(rows, { ...header, isSeeded: true })).toThrow(/wrong Session/)
    const local = [...approvals, event('session/end-seed', 2, { inherited: true }), { ...delivery(3, 'parent'), seq: 3 }]
    expect(() => restore(local, { ...header, isSeeded: true, parentSession: 'parent' })).toThrow(/wrong Session/)
  })

  it('validates V4 ownership without treating a historical V3 marker as current or changing its value', () => {
    const rows = [...approvals, delivery(3, 'historical'), { ...delivery(4), seq: 3 }]
    const artifact = { header: { ...header, version: 4 }, inheritedEventCount: 0, events: rows }
    const before = JSON.stringify(artifact)
    expect(restoreReleasedV4Artifact(artifact, new Set())).toBe(artifact)
    expect(JSON.stringify(artifact)).toBe(before)
    expect(() => restore([...approvals, delivery(4, 'foreign')], { ...header, version: 4 })).toThrow(/wrong Session/)
    const inherited = [...approvals, delivery(4, 'parent'), event('session/end-seed', 3, { inherited: true })]
    expect(restore(inherited, { ...header, version: 4, isSeeded: true, parentSession: 'parent' }).events).toEqual(inherited)
  })

  it('leaves other historical and future delivery generations untouched', () => {
    const rows = [0, 1, 2, 5].map((version, seq) => ({ ...delivery(version, 'foreign'), seq }))
    expect(restore(rows).events).toEqual(rows)
    expect(() => restore([event('session-log-deepseek/delivery-accepted', 0, null)], { ...header, version: 4 })).toThrow(/object/)
  })
})
