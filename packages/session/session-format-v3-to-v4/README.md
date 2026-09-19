---
description: "Restore released V3 Sessions as V4 while preserving approval decisions, event values, and inherited coordinates."
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v3-to-v4

English | [中文](README.zh.md)

## Summary

Restore released V3 Sessions as V4 without changing admitted event values. The edge preserves remembered approval decisions, message identities, event order, references, and inherited cuts while advancing only the header version. The static Session format catalog consumes this library; the package performs no file I/O.

## Table of Contents

- [Use this package](#use-this-package)
- [V3-to-V4 specification](#v3-to-v4-specification)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Use the [catalog](../session-format-catalog/README.md) for complete restoration. Direct imports from the [public entry](src/index.ts) serve catalog assembly and tests; this library has no Cordis mount configuration.

The header-only operation validates V3 metadata and returns V4 metadata without reading events:

```text
const targetHeader = sessionFormatV3ToV4.migrateHeader(sourceHeader)
```

Full restoration decodes rows, feeds a fresh migration stage, calls `finish()`, and validates the target artifact. Partial emissions do not establish a successful restore. The [format protocol](../session-format/README.md) owns scheduling and error handling; [JSONL persistence](../session-persistence-jsonl/README.md) owns immutable successor publication.

-----

<a id="v3-to-v4-specification"></a>
## V3-to-V4 specification

The logical header changes only `version: 3` to `version: 4`. Every admitted event retains its type, payload, timestamp, sequence, optional envelope fields, and position. This includes `approval/asked.data.alwaysAllowKey`, `approval/decided.data.outcome: 'allowed-always'`, system messages, replacement endpoints, captured format versions, and opaque nested values. The edge neither inserts events nor renames presets.

Source sequences remain dense from zero. The last `session/end-seed` with `data.inherited: true` determines the inherited cut, excluding that marker. A supplied cut must agree. Seeded inputs require a marker; unseeded inputs forbid one. The stage derives an unknown cut after earlier migrations finish and expands compact runs without retaining an intermediate array.

V3 physical decoding and V4 event encoding reuse the released V3 codec. Target restoration retains V3 structural and relationship validation, including protected system heads and required-event admission. Unknown required events are refused unless the installed event set recognizes them; unknown ignorable events retain their values. Identity conversion does not reinterpret opaque references.

Delivery acknowledgements retain their recorded generation and `throughSeq`. A V3 source marker already claiming V4 is refused because migration must not activate a future-generation acknowledgement. A source V3 marker naming another Session is admitted only inside an inherited prefix with parent metadata. Native V4 restoration applies the same ownership check to V4 markers; historical generations remain historical.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [codec](src/codec.ts) translates only the header version around the frozen V3 codec. The [stage](src/migration.ts) owns per-artifact sequence, seed, and delivery checks. The [restorer](src/validation.ts) uses a private generation-adjusted validation view for delivery relationships and returns the original artifact unchanged. Historical version literals remain independent of the installed writer constant.

No runtime invariant companion is published because pure codecs and per-artifact stages have no independently changing runtime observations to compare.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Released V2-to-V3 semantics](../session-format-v2-to-v3/README.md)
- [Format version and release status](../../../docs/session-format-status.md)
- [Persistence-type acknowledgements](../../../docs/cookbook/reviewing-persistence-type-changes.md)

-----

<a id="model-experience"></a>
## Model Experience

### Restored Session history

#### What the model sees

The migration preserves every admitted recorded message and request value. The `approval/asked` and `approval/decided` audit events remain log-only.

#### Token effect

The edge adds no model-visible text and changes no recorded message content.

#### KV Cache effect

Historical request content and configuration remain unchanged. Provider cache availability remains outside this package.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No file migration** — the library never rewrites a committed generation. Persistence owns successor publication; an existing V4 artifact does not rerun this incoming edge.
- **Released admission remains fixed** — the edge cannot repair unsupported earlier generations or reinterpret their payloads. Earlier migrations retain their own refusal policies.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
