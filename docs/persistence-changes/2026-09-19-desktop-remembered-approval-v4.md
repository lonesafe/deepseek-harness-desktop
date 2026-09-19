---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-19-desktop-remembered-approval-v4

English | [中文](2026-09-19-desktop-remembered-approval-v4.zh.md)

## Summary

Reconciles the desktop fork’s remembered approval audits with the tracked persistence types and advances the Session writer to V4.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-19-desktop-remembered-approval-v4
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445"
    decision: version-bump
  - root: "event:approval/asked"
    previous: "2026-09-11-initial"
    after: "3de4c78f5e8160145c72557799ff01437fcca26415f5f1203bac4aaf536bfb31"
    decision: version-bump
  - root: "event:approval/decided"
    previous: "2026-09-11-initial"
    after: "3540ba912cce0277667259834443a3109f6111e96227a5ba15e2655af1552f3a"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

The desktop fork already writes alwaysAllowKey and the allowed-always outcome in V3. The optional ask key may be absent in ordinary upstream records. Adding a literal to the tracked closed outcome union requires a new header version, so V4 records use the adjacent V3-to-V4 migration. Migration preserves event values, identities, sequence references, and inherited cuts; historical generations are never overwritten. Older readers reject the V4 header instead of receiving an unknown outcome under their advertised format. V3 delivery acknowledgements remain historical and a source marker cannot claim the target generation. Accepted upstream type records and released codecs remain unchanged.

<a id="verification"></a>
## Verification

317 focused migration tests across the new edge and frozen V3 test catalogs passed; the new edge’s 15 cases cover all source statements, branches, functions, and lines. Current catalog and generator checks passed 34 tests. The predecessor fixture hashes are retained for integrated replay verification.

<a id="dev-note"></a>
## Dev Note

None.
