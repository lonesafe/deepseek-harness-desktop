# @deepseek-ai/dsh-host-directory-picker-auto

English | [中文](README.zh.md)

The **adaptive chooser** of the [directory-picker seam](../directory-picker/README.md): a node-half-only plugin that resolves the host's situation once at boot and mounts a backend plus its client surface as real Loader entries in the in-memory root tree (never persisted to a config file; the root tree's `write()` is a no-op). A browse resolution mounts [`-browse`](../directory-picker-browse/README.md) with the in-app browser. A native resolution mounts the [`-native`](../directory-picker-native/README.md) adaptive backend with that same browser surface configured to use the OS chooser on loopback and in-app browsing on remote pages. Unloading the chooser removes both entries and joins their teardown.

Resolution is one pure boot-time sample (`resolveDirectoryPickerBackend`), exported for reuse. `native` requires a loopback-only bind, no SSH launch, and a servable display session — assumed on darwin/win32; on linux `DISPLAY`/`WAYLAND_DISPLAY` plus zenity or kdialog on `PATH`; never on another platform. Anything ambiguous resolves to `browse`. The sample happens once per boot, while the adaptive client surface decides between native and browse per page from `ctx.connection.isLoopback`. Pinning an interaction is not a config field here: compose `-browse` directly to force in-app browsing.

## Model Experience

None, as the chooser only composes the GUI host's directory selection; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Detection infers operator location from launch context, which no launch-side signal can prove** — a tmux session detached from its SSH launch loses the `SSH_*` markers; a Darwin process outside an Aqua session still counts as displayed; and a workstation-local launch later reached through `ssh -L` arrives from `127.0.0.1`, resolves `native`, and opens the chooser on the unattended workstation. A wrong `native` choice degrades to the backend's existing retryable failure dialog, and composing `-browse` directly selects the safe interaction for such deployments.
- **The Linux chooser probe reads `PATH` only** — a zenity/kdialog reachable some other way (shell alias, non-PATH install) still resolves `browse`; installing either binary on `PATH` restores `native` eligibility at the next boot.
- **Boot-time only** — one resolution serves every client of the boot; per-connection adaptivity (native for a local browser, browse for a remote one, same server) would need a per-client capability and the wire advertisement the seam deliberately deleted, and waits for a deployment that serves both at once.
