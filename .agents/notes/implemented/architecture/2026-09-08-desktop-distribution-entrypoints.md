# Agent Note: Desktop distribution entrypoints

Status: implemented

English | [中文](2026-09-08-desktop-distribution-entrypoints.zh.md)

## Problem

The fork distributes macOS, Windows, and Linux installers with authenticated LAN access, a device relay, and portal updates. The official Electron distribution loads a bundled dsh tree through its private Host and connects packaged Web assets to authenticated APIs. Combining their entrypoints or resource layouts would boot a shell without its required runtime or remove supported desktop capabilities.

## Decision

The fork packager stages `lib/web-main.js` as the application manifest entry. It retains the managed Web profile and native installer matrix described by the [desktop launcher decision](2026-08-15-electron-desktop-launcher.md). The official packager uses `lib/main.js`, its Electron Node runtime and bundled pnpm, dsh tree, preloads, and [shared Web profile runner](2026-09-10-desktop-web-wrapper.md). Both distributions build against the same workspace version and receive the shared Web and Harness changes.

Entrypoint selection belongs to the packager, rather than a runtime resource-presence fallback. The two distributions keep their update origins, profile ownership, and transport permissions explicit. The [portal update decision](2026-08-16-portal-hosted-desktop-update-channel.md) continues to govern the fork installers.

## Alternatives considered

**Replace the fork distribution with the isolated packager.** Its target set and protocol do not provide the fork's Linux installers or authenticated LAN and relay workflows. Replacing the release path would remove supported product behavior.

**Discard the isolated desktop implementation.** This would omit upstream's independent runtime, plugin management, and profile recovery. Keeping its matching entry and packaging commands preserves those capabilities without changing installed fork clients' state ownership.

## Consequences

Maintainers qualify two desktop packaging paths and must not combine their runtime resources. The build emits both entries and the isolated preloads; the fork stage selects its entry before packaging. Desktop process, package-target, runtime-tree, update, and staging tests cover their owners, while shared connection and browser tests cover the merged Web application. Native release runners remain responsible for installer verification on each platform.

The fork includes pnpm in its production tree. Its packaged `node` and `pnpm` launchers execute under Electron Node mode after the plugin manager applies its normal credential scrub. These launchers precede system tools on the managed backend PATH, so plugin installation and package scripts require no system Node or pnpm. The official distribution retains its own runtime launcher and package-manager configuration.

Optional experimental bundles supply their own experimental peers. The desktop manifest supplies stable shared peers, while the closure gate checks every installation path for a provider in its enclosing dependencies. Shipping a disabled bundle does not make its experimental services part of the default desktop profile.

Both packaging paths verify the shipped POSIX lock through `@deepseek-ai/node-addon-system/flock`. The isolated runtime payload smoke additionally checks contention and release after closing the descriptor. It uses the same native dependency as the fork stage; `fs-ext` is not part of either runtime. Windows keeps its separate native dependency probe.

Windows Office engines require the release MSVC runtime. Fork staging copies the build host’s redistributable CRT beside each engine executable, rejects incomplete payloads, and leaves engine-owned DLLs untouched. Installed previews therefore do not depend on a separately installed VC++ runtime.
