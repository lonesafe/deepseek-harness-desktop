# Agent Note: Electron desktop launcher and native packaging

Status: implemented

English | [中文](2026-08-15-electron-desktop-launcher.zh.md)

## Problem

DeepSeek Harness has a complete browser application, but installing Node.js, pnpm, and starting `dsh web` is not a desktop-client experience. A distributable application must carry the production runtime, preserve the existing plugin composition, own startup and shutdown, and produce native artifacts for macOS, Linux, and Windows without turning the Electron renderer into a privileged Node process.

## Decision

`apps/desktop` is an Electron main-process application. It reuses Electron's embedded executable with `ELECTRON_RUN_AS_NODE=1` to spawn the packaged `@deepseek-ai/dsh` entry as `node --expose-internals <dsh-entry> web --port 0`; the Node flag supplies the loader internals required by the shipped HMR plugin. The Web composition binds to `127.0.0.1` by default; the authenticated [LAN access decision](../feature/2026-08-15-authenticated-lan-web-access.md) may add the all-interfaces host and access token after an explicit desktop action. The separate [account-device relay](../feature/2026-08-15-account-device-remote-relay.md) keeps the local bind unchanged and lets the main process proxy authenticated outbound tunnel traffic to that exact loopback origin only after the user enables remote control. The launcher waits for the readiness line, always loads the exact random loopback origin, and terminates the owned process tree and tunnel during application shutdown. Harness state uses a `runtime` child of Electron's per-user application-data directory so Electron sockets and caches never enter Harness file watching, while the initial workspace location uses the user's home directory.

The BrowserWindow enables context isolation and renderer sandboxing, disables Node integration, webviews, permission grants, and insecure content, and admits navigation only within the managed origin. Credential-free HTTPS links may open in the system browser; all other external targets are rejected. The launcher exposes no preload API.

The desktop package is deployed with pnpm before electron-builder runs. Its manifest explicitly supplies every required workspace peer in the reachable production graph because automatic peer installation is disabled; `verify-runtime-closure.ts --manifest apps/desktop/package.json` keeps that dependency-only closure complete. Packaging leaves the application outside asar so the embedded Node process can execute the ESM CLI and load its runtime assets directly, and it does not rebuild the staged pnpm tree.

`desktop:dist` packages the current platform. The native GitHub Actions matrix installs and packages separately on macOS arm64, macOS x64, Linux x64, and Windows x64, producing DMG/ZIP, AppImage/DEB, and NSIS/ZIP artifacts respectively. The macOS release job supports two explicit modes. With a complete Base64-encoded Developer ID Application P12, its password, and App Store Connect API key in Actions Secrets, electron-builder imports the identity, signs with Hardened Runtime and the Electron JIT entitlements, submits the application for Apple notarization, and staples the ticket. The job then verifies the application with `codesign --verify --deep --strict`, Gatekeeper's `spctl --assess`, and `stapler validate`. With no Apple credentials, it deliberately disables identity auto-discovery and publishes an unsigned package; a partial credential set fails as a configuration error. The root README documents the Control-click and Privacy & Security first-launch paths required for unsigned packages. Local packaging without credentials has the same unsigned behavior.

## Verification

Unit tests pin local and LAN readiness parsing, persisted LAN and remote preference validation, browser device authorization, fixed-loopback relay forwarding, privileged-method refusal, bounded child shutdown, exact-origin navigation, and external-link policy. The runtime-closure gate traverses workspace dependencies and required peers. A staged-runtime smoke test starts `dsh web` from the deployed production tree and fetches the generated application page; platform packaging then exercises the embedded runtime from the packaged executable. On both macOS architectures, the release lane distinguishes the fully configured signed mode from the explicitly unsigned mode; signed mode additionally gates publication on code-signature validity, Gatekeeper acceptance, and a stapled notarization ticket.

## Alternatives considered

**Rewrite the desktop carrier as file URLs plus IPC.** This removes the loopback listener but duplicates the mature HTTP/WebSocket carrier and requires a new fetch, upgrade, plugin-bundle, and static-resource path. The managed loopback origin preserves the existing application protocol and limits exposure to the local machine.

**Require a separately installed Node.js runtime.** This produces a smaller download but makes startup depend on the user's PATH and runtime version. Reusing Electron's embedded Node runtime makes the desktop artifact self-contained.

**Cross-compile every platform on one host.** The production graph contains platform-specific native and optional modules. Native runners install the correct dependency variants and avoid shipping the packager host's binaries into another target.

**Give the renderer Node integration.** Direct process access would simplify launching, but it would turn any renderer compromise into local code execution. Process ownership stays in the isolated Electron main process.

## Consequences

Users receive a conventional desktop application with no separate Node.js, pnpm, terminal, or browser prerequisite, while the Web and desktop products share one UI and backend composition. Startup errors include bounded child diagnostics, one application instance owns one local backend, and shutdown does not intentionally leave that backend behind.

The trade-off is artifact size: Electron plus the explicit Harness runtime closure is substantially larger than the Web assets alone, and `asar: false` produces an inspectable resource tree. The random listener remains loopback-only by default; authenticated LAN binding and account-based remote control are separate explicit persisted preferences, while the privileged Electron window always accepts only its exact loopback origin. macOS signing and notarization depend on externally managed Apple credentials, so releases produced without them require the documented one-time Gatekeeper approval; Windows signing, package-repository publication, and operation of the independent relay service remain release-infrastructure responsibilities rather than properties of the local build.
