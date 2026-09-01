---
description: "Workspace-directory picking seam for the web GUI Host: fixed native and browse interactions, the adaptive desktop capability, and typed browse errors."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker

English | [中文](README.zh.md)

## Summary

The web GUI Host lets an operator choose a workspace directory through one service whose single method reports the composed interaction. A fixed native provider opens an OS chooser, a fixed browse provider serves listing and creation for an in-app browser, and an attended desktop exposes both as one stable adaptive capability so its loopback window and authenticated remote pages use reachable interactions without replacing the Host service. Consumers switch on the capability kind. This seam is GUI-Host only and never reaches the agent loop.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount exactly one directory-picker backend and let the workspace flow drive it: the seam itself is only the service contract, so a composition without a backend has no way to pick a directory.

### Choosing a backend

The [attended-desktop backend](../directory-picker-native/README.md) exposes native selection to loopback pages and browse operations to remote pages. The [browse backend](../directory-picker-browse/README.md) works everywhere and is the fixed choice for headless or remote-only Hosts. Compose the [adaptive chooser](../directory-picker-auto/README.md) when the same application composition must resolve that Host-level choice at boot.

### The capability contract

`capability()` returns a discriminated union describing how an operator selects a directory: `{ kind: 'native', pick(signal) }` for a fixed OS chooser, `{ kind: 'browse', list(path?), createDirectory(path, name) }` for a fixed in-app browser, or `{ kind: 'adaptive', pick(signal), list(path?), createDirectory(path, name) }` for an attended desktop. Consumers switch on `kind`; an unknown capability hides the affordance rather than failing. Browse failures throw `DirectoryPickerError` with the closed codes `directory-unreadable`, `directory-exists`, and `directory-create-failed`.

### What rows carry

`DirectoryEntry` rows expose the absolute `path` and a host-owned `hidden` flag (dot-prefixed on POSIX) so display policy stays client-side; clients never join path segments themselves. `DirectoryListing.crumbs` is the ancestor chain from the filesystem root to the listed directory — every crumb is a jump target, and the root crumb is labeled by its full path.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The seam is built on one separation: the interaction shape a backend provides is a contract, not an implementation detail. `DirectoryPicker` is an abstract Cordis service with a single `capability()` method; a backend subclass registers as `ctx.directoryPicker`, and loading a second implementation throws the standard duplicate-service error. The capability object must be stable for the service lifetime because consumers may capture it across calls.

### The merge-extensible vocabulary

`DirectoryPickerCapabilities` is a merge-extensible map keyed by capability kind, and `DirectoryPickerCapability` derives the union from it. The shipped map contains `native`, `browse`, and `adaptive`; a future provider declaration-merges its entry instead of replacing the union. Client surfaces are separate packages mounted beside the Host backend: the auto chooser pairs an adaptive backend with the browse surface configured to choose native only for loopback pages.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition: abstract `DirectoryPicker`, capability vocabulary, typed error, Context merge |

### Failure vocabulary

`DirectoryPickerError` carries a closed `DirectoryPickerErrorCode` plus the absolute subject path, so consumers map business codes without string matching. The seam Agent Note records the design rationale, the separation from `ctx.fs`, and the policy decisions.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the seam contract is not enough: the decision record first, then the two backends and the adaptive chooser that compose it.

- [Directory-picker capability seam decision](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.md) — design rationale, the `ctx.fs` separation, and the policy decisions.
- [Attended-desktop backend](../directory-picker-native/README.md) — the adaptive interaction and its native platform tooling.
- [Browse backend](../directory-picker-browse/README.md) — the in-app listing and creation interaction for remote clients.
- [Adaptive chooser](../directory-picker-auto/README.md) — Host-level boot resolution plus page-level interaction selection.
- [Workspace subsystem](../../../docs/subsystems/workspace.md) — the workspace records the picked directory feeds.

-----

<a id="model-experience"></a>
## Model Experience

None, as the GUI-host picking seam registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the seam contract leaves a decision to a future consumer. They are current package constraints, not a task backlog.

- **No multi-root support** — the browse contract exposes one ancestry chain per listing; per-deployment root scoping (and Windows drive-root enumeration above a drive) waits for a consumer that needs it, per the DirectoryPicker Agent Note.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
