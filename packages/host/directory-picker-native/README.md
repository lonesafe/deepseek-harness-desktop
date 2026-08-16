# @deepseek-ai/dsh-host-directory-picker-native

English | [中文](README.zh.md)

The **attended-desktop backend** of the [directory-picker seam](../directory-picker/README.md): `NativeDirectoryPicker` registers the `adaptive` capability. Its `pick(signal)` opens a native chooser for a loopback desktop window, while `list` and `createDirectory` serve the in-app browser used by a remote page connected to the same desktop Host. Platform tools run without a shell: `osascript` on macOS and Zenity with a KDialog fallback on Linux; the caller's abort terminates the native process. Windows opens the modern `IFileOpenDialog` in a spawned child process — a koffi-driven COM conversation on the child's main thread with the best thread DPI awareness the host accepts (per-monitor-v2 first), aborted by posting `WM_CLOSE` to the dialog thread. The command boundary (`DirectoryPickerRunner`) and platform facts are injectable. The shared no-shell subprocess runner lives in [`dsh-native-command`](../../util/native-command/README.md).

[`dsh-host-directory-picker-auto`](../directory-picker-auto/README.md) pairs this backend with the browse client surface in adaptive mode: that surface invokes `host.pickDirectory` only from a loopback page and otherwise renders its directory browser over `host.listDirectory` and `host.createDirectory`.

## Model Experience

None, as the backend serves the GUI host's directory selection; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Linux requires desktop tooling** — with neither Zenity nor KDialog installed, `pick` rejects with an actionable error; it does not fall back to a typed-path prompt (the browse backend is that fallback at the composition level).
- **Windows has no mechanism fallback** — the child-process picker through packaged koffi is the only native tier, so a COM refusal or dialog crash surfaces the failure. The browse backend remains the fallback at the composition level.
