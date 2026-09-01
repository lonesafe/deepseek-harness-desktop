---
description: "Adaptive chooser of the directory-picker seam: resolves the Host backend once at boot, then serves loopback and remote desktop pages through their reachable interactions."
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-auto

English | [中文](README.zh.md)

## Summary

`dsh-host-directory-picker-auto` resolves the Host backend once per boot and mounts it with the client surface as real Loader entries in the in-memory root tree. A browse resolution serves every page through the in-app browser. A native resolution mounts the attended-desktop backend and configures the same browse surface to use the OS chooser on a loopback page while a remote page keeps the in-app browser. The Host capability stays stable for the service lifetime; page authority selects only which operation that capability exposes to the current browser.

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

Compose this plugin instead of a concrete backend when one desktop process may serve its local window and authenticated remote pages, or when the same composition also runs in remote and headless environments. The chooser inspects the Host once at boot and mounts the matching capability plus one client surface.

### How the choice is made

`native` requires every signal that the operator can see the host display and the native backend can serve it: a loopback-only bind (read from the injected `webServer`; an all-interfaces bind admits remote browsers no OS chooser can reach), no SSH launch (`SSH_CONNECTION`/`SSH_TTY` unset or blank), and a servable display session — assumed on darwin and win32; on linux, `DISPLAY`/`WAYLAND_DISPLAY` plus a zenity or kdialog binary on `PATH`; never on any other platform. Anything ambiguous resolves to `browse`, which works everywhere.

### What you get

The backend and client surface arrive as ordinary Loader entries. For a browse resolution, the backend exposes listing and creation and the surface always renders the in-app browser. For a native resolution, the backend exposes the stable `adaptive` capability and the surface chooses by `ctx.remote.$host.isLoopback`: native `pick` for the local window, listing and creation for a remote page. The client module table discovers the surface exactly as it discovers a config row. Unloading the chooser removes both entries and joins their teardown.

### Pinning an interaction

Pinning is not a config field here: compose the `-native` or `-browse` row directly instead of this one — that is the seam's documented swap point. Mounting the chooser and a backend row together fails loud (duplicate `directoryPicker` service, duplicate client flow in the `single` holes).

### Observable failures

A local native failure reaches the existing retryable failure dialog. Remote pages never attempt the privileged native call; they retain the in-app browser. Composing `-browse` directly selects that interaction for every page when the Host probe cannot establish a usable display.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The chooser is a pure decision plus a mount: `resolveDirectoryPickerBackend` samples Host facts once at boot and returns a backend kind, and `apply` mounts the backend and surface as real Loader entries in the in-memory root tree — never persisted to a config file, because the root tree's `write()` is a no-op. Both kinds use `dsh-client-ui-directory-picker-browse`; only the native resolution passes `nativeOnLoopback: true`. The effect's disposer removes both entries and joins their fibers' teardown.

### The resolution table

| Condition | Backend |
|---|---|
| Bind host is not `127.0.0.1` | `browse` |
| `SSH_CONNECTION` or `SSH_TTY` present | `browse` |
| darwin or win32 | `native` |
| linux with a chooser binary and a display | `native` |
| anything else | `browse` |

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: `BACKEND_PACKAGES`/`SURFACE_PACKAGES` maps, `apply` mount and unmount |
| [`src/resolve.ts`](src/resolve.ts) | `resolveDirectoryPickerBackend` — the pure boot-time decision |
| [`src/probe.ts`](src/probe.ts) | Host probes: `hasLinuxChooserBinary`, `canExecute` |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these when the chooser's contract is not enough: the seam definition first, then the two backends it mounts.

- [Directory-picker seam](../directory-picker/README.md) — the capability contract the chooser composes.
- [Directory-picker capability seam decision](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.md) — why backends differ in interaction shape.
- [Native backend](../directory-picker-native/README.md) — the interaction mounted for a local operator.
- [Browse backend](../directory-picker-browse/README.md) — the interaction mounted everywhere else.

-----

<a id="model-experience"></a>
## Model Experience

None, as the GUI-host picking chooser only mounts a backend row and registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the boot-time sample can misjudge the host. They are current package constraints, not a task backlog.

- **Detection can overestimate display availability** — a tmux session detached from its SSH launch loses the `SSH_*` markers, and a Darwin process outside an Aqua session still counts as displayed. This affects only loopback pages: remote pages use the in-app browser even when the Host resolved `native`. A wrong local choice reaches the retryable failure dialog; composing `-browse` directly selects the safe interaction for every page.
- **The Linux chooser probe reads `PATH` only** — a zenity/kdialog reachable some other way (shell alias, non-PATH install) still resolves `browse`; installing either binary on `PATH` restores `native` eligibility at the next boot.
- **The Host resolution is boot-time only** — display and SSH changes do not replace the mounted capability until restart. Page-level reachability remains dynamic: each page independently uses its existing loopback authority to choose native or browse without changing the Host service.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
