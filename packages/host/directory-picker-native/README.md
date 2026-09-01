---
description: "Attended-desktop backend of the directory-picker seam: native selection for loopback pages plus browser listing and creation for remote pages."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-native

English | [中文](README.zh.md)

## Summary

`dsh-host-directory-picker-native` is the attended-desktop backend: it registers one stable `adaptive` capability containing the native OS chooser for a loopback page and the listing and creation primitives an authenticated remote page needs for in-app browsing. macOS drives `osascript`, Linux uses Zenity with a KDialog fallback, and Windows opens the modern `IFileOpenDialog` in a spawned child process. The [adaptive chooser](../directory-picker-auto/README.md) mounts this backend only when the Host has a servable display and pairs it with the browse client surface, which selects the reachable interaction per page.

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

Compose this backend for an attended desktop that may serve both its local window and remote browsers. A loopback workspace flow calls `pick(signal)` once per open request; a remote flow calls `list(path?, signal)` and `createDirectory(path, name)` through the in-app browser. The capability object and all three operation identities remain stable for the service lifetime.

### When to choose it

Choose this backend for an attended workstation on macOS, Windows, or desktop Linux, including one that accepts authenticated remote browsers. Choose the [browse backend](../directory-picker-browse/README.md) for SSH and unattended hosts with no usable display. The [adaptive chooser](../directory-picker-auto/README.md) makes that Host-level decision at boot and keeps remote pages on the browser interaction even when it resolves native.

### What an operator experiences

A loopback page opens one native chooser on the Host display and waits for the operator; aborting the caller's signal terminates the chooser process instead of leaving it open. On Linux the chooser needs either Zenity or KDialog installed. A remote page never opens a dialog on that display: the paired browse surface lists, navigates, and creates directories through the same adaptive capability.

### Observable failures

A native cancel returns `null`, not an error. Missing platform tooling, a failed chooser launch, or an aborted local pick surfaces as a rejection the UI can present. Remote browse errors retain the typed directory-picker failure vocabulary. The [browse backend](../directory-picker-browse/README.md) remains the Host-level choice when no local native interaction is viable.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

`NativeDirectoryPicker` combines two maintained implementations behind one stable `adaptive` capability. `pick` forwards to `pickNativeDirectory`; `list` and `createDirectory` forward to the browse capability created by `dsh-host-directory-picker-browse`. Native choosers run as subprocesses so the Host process never blocks on a dialog. The command boundary (`DirectoryPickerRunner`) and platform facts are injectable, and the shared no-shell subprocess runner lives in [`dsh-native-command`](../../util/native-command/README.md).

### Platform mechanics

Platform tools run without a shell: `osascript` on macOS, and Zenity with a KDialog fallback on Linux; the caller's abort terminates the native process. Windows opens the modern `IFileOpenDialog` in a spawned child process — a koffi-driven COM conversation on the child's main thread with the best thread DPI awareness the host accepts (per-monitor-v2 first), aborted by posting `WM_CLOSE` to the dialog thread.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `NativeDirectoryPicker` service with the stable `adaptive` capability |
| [`src/native-picker.ts`](src/native-picker.ts) | Chooser dispatch: platform selection, subprocess running, abort wiring |
| [`src/win32-dialog.ts`](src/win32-dialog.ts) + siblings | Windows child-process `IFileOpenDialog` via koffi, DPI handling, `WM_CLOSE` abort |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the backend contract is not enough: the seam definition first, then the alternative backend and the chooser that selects between them.

- [Directory-picker seam](../directory-picker/README.md) — the `adaptive` capability contract and the typed error vocabulary.
- [Directory-picker capability seam decision](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.md) — why backends differ in interaction shape.
- [Browse backend](../directory-picker-browse/README.md) — the in-app alternative for remote clients.
- [Adaptive chooser](../directory-picker-auto/README.md) — boot-time resolution between native and browse.
- [No-shell subprocess runner](../../util/native-command/README.md) — the shared subprocess primitive the chooser runs on.

-----

<a id="model-experience"></a>
## Model Experience

None, as the GUI-host picking backend registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the native interaction is unavailable or fragile. They are current package constraints, not a task backlog.

- **Linux requires desktop tooling for loopback native selection** — with neither Zenity nor KDialog installed, `pick` rejects with an actionable error. Remote pages remain able to browse; the auto chooser resolves the fixed browse backend when its startup probe sees neither tool.
- **Windows has no native mechanism fallback** — the child-process picker through packaged koffi is the only native tier, so a COM refusal or dialog crash surfaces to the loopback page. Remote browsing is independent of that tier.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
