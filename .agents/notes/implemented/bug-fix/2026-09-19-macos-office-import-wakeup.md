# Agent Note: macOS Office importer completion wakeup

Status: implemented

English | [中文](2026-09-19-macos-office-import-wakeup.zh.md)

## Problem

LibreOffice kit `0.0.1` can leave a completed XLSX import waiting for a macOS application event. Small valid workbooks reach the conversion deadline while the import worker is idle. The [pinned Core revision](../../../../packages/document/office-to-pdf/native/sources.json) posts `Application::EndYield()` when sheet imports finish, but Quartz can consume that wakeup and enter another indefinite wait.

## Decision

The [Office provider](../../../../packages/document/office-to-pdf/README.md) ships a universal macOS helper compiled from the installed kit's checksum-pinned worker, three revision-pinned LibreOfficeKit headers, and a small Objective-C++ compatibility source. After a dequeued Quartz `YieldWakeupEvent`, the helper changes the next matching indefinite event read into a nonblocking read. Other events, finite deadlines, modes, masks, and peek operations retain their semantics. The original engine, cancellation owner, and conversion deadline remain unchanged.

A generated private entry preserves the kit's validators, font worker, engine resolution, and scrubbed child environment while selecting this helper. Its input is an exact kit entry checksum. The provider publishes the adapter, helper, source materials, notices, and build manifest. Source and Desktop builds compile the helper; npm releases carry a verified macOS artifact. Ordinary Windows and Linux installs use the published kit entry unchanged. ASAR installs use the private entry with the macOS compatibility helper or the original helper on other platforms: JavaScript and font-worker imports retain logical archive URLs, while native paths map to unpacked resources.

This is a bounded exception to [independent kit ownership](../architecture/2026-09-14-independent-libreoffice-kit.md). The [platform selection decision](../architecture/2026-09-15-platform-office-engines.md) remains authoritative. Remove the compatibility build and private entry together after a qualified kit release completes the same XLSX, event-sequence, and native ASAR filesystem-path regressions without either local adaptation.

## Alternatives considered

**Increase deadlines or retry.** A completed importer waiting for an unrelated event has no bounded progress condition. More time does not repair its wakeup.

**Initialize AppKit or select SVP.** AppKit initialization and a real application-loop callback still reproduced the stall. The installed payload selected Quartz even with the SVP preference.

**Inject a dynamic library.** Injection repairs the same input in the original helper, confirming that recompilation does not cause success, but hardened signing adds a library-injection entitlement concern. Static linking preserves existing signing permissions and avoids inherited loader variables.

**Generate periodic events.** Synthetic input and polling would change unrelated event processing and introduce a timing policy. The compatibility code responds only to the consumed Quartz wakeup.

**Ship only a workspace dependency patch.** npm consumers do not inherit the workspace's patched dependency resolution. The private entry travels with the provider's published assets.

## Consequences

Harness maintains the compatibility source and pinned inputs until the kit supplies a qualified replacement. Source drift, missing helpers, and incompatible manifests fail explicitly. There is no runtime compiler, download, or engine fallback. Pre-signing verification checks source identity, both Mach-O architectures, executable permission, and artifact hashes. Desktop signing and its final runtime inventory own the signed bytes.

The deterministic native regression controls event return values and verifies one-time nonblocking behavior, finite deadlines, and unrelated events. Removing the compatibility condition makes it fail. Native qualification also checks six Office formats and a four-sheet workbook through PDF text and page inspection. Browser and packaged-runtime qualification remain necessary; compiling both architectures does not replace executing each target.
