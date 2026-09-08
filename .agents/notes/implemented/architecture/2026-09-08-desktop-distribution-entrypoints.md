# Agent Note: Desktop distribution entrypoints

Status: implemented

English | [中文](2026-09-08-desktop-distribution-entrypoints.zh.md)

## Problem

The fork distributes macOS, Windows, and Linux installers with authenticated LAN access, a device relay, and portal updates. The isolated Electron distribution installs an offline seed into a private profile and carries requests through framed pipes. Combining their entrypoints or resource layouts would boot a shell without its required runtime or remove supported desktop capabilities.

## Decision

The fork packager stages `lib/web-main.js` as the application manifest entry. It retains the managed Web profile and native installer matrix described by the [desktop launcher decision](2026-08-15-electron-desktop-launcher.md). The isolated packager uses `lib/main.js`, its bundled Node.js and pnpm, offline seed, preloads, and [transactional installation](2026-08-25-electron-desktop-packaging-and-updates.md). Both distributions build against the same workspace version and receive the shared Web and Harness changes.

Entrypoint selection belongs to the packager, rather than a runtime resource-presence fallback. The two distributions keep their update origins, profile ownership, and transport permissions explicit. The [portal update decision](2026-08-16-portal-hosted-desktop-update-channel.md) continues to govern the fork installers.

## Alternatives considered

**Replace the fork distribution with the isolated packager.** Its target set and protocol do not provide the fork's Linux installers or authenticated LAN and relay workflows. Replacing the release path would remove supported product behavior.

**Discard the isolated desktop implementation.** This would omit upstream's independent runtime, plugin management, and transactional seed installation. Keeping its matching entry and packaging commands preserves those capabilities without changing installed fork clients' state ownership.

## Consequences

Maintainers qualify two desktop packaging paths and must not combine their runtime resources. The build emits both entries and the isolated preloads; the fork stage selects its entry before packaging. Desktop process, package-target, seed, update, and staging tests cover their owners, while shared connection and browser tests cover the merged Web application. Native release runners remain responsible for installer verification on each platform.
