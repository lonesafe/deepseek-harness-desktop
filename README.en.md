# DeepSeek Harness Desktop

[中文](README.md) | English

[![Desktop installers](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml/badge.svg)](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml) [![Release](https://img.shields.io/github/v/release/lonesafe/deepseek-harness-desktop?include_prereleases)](https://github.com/lonesafe/deepseek-harness-desktop/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**运行环境零配置 · 简单易用 · 开箱即用 · 零开发门槛**

Download, install, and open. There is no need to install Node.js, pnpm, Electron, run terminal commands, or start a browser manually. The desktop client includes everything required to run DeepSeek Harness; model-provider credentials can be entered inside the application when needed.

[Download DeepSeek Harness Desktop 1.0 Beta 1](https://github.com/lonesafe/deepseek-harness-desktop/releases/tag/v1.0.0-beta.1)

DeepSeek Harness Desktop packages the official open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web experience as a self-contained desktop application for macOS, Linux, and Windows. Electron, Node.js, the production plugin graph, and the Web assets travel inside the installer, so users do not need to install Node.js, pnpm, or launch a browser.

This is a community-maintained desktop distribution. It is not an official DeepSeek product and is not endorsed by or affiliated with DeepSeek AI.

## Download and start

1. Open the [v1.0.0-beta.1 release](https://github.com/lonesafe/deepseek-harness-desktop/releases/tag/v1.0.0-beta.1).
2. Download the package for your system.
3. Install and open the application.

| Platform | Architecture | Packages |
|---|---:|---|
| macOS | Apple Silicon | DMG or ZIP |
| macOS | Intel | DMG or ZIP |
| Windows | x64 | NSIS installer or ZIP |
| Linux | x64 | AppImage or DEB |

The beta installers are unsigned. macOS may require Control-clicking the app and choosing **Open**; Windows SmartScreen may display an unknown-publisher warning. Review the release checksums before installing.

## Why it is zero setup

- **No runtime installation:** Electron, Node.js, the production plugin graph, and Web assets are included.
- **No command line:** the desktop launcher starts and stops the local Harness service automatically.
- **No separate browser:** the complete Harness interface opens in its own desktop window.
- **No development setup:** download the native package for macOS, Windows, or Linux and start using it.

## Beta status

`v1.0.0-beta.1` is the first public desktop beta. The launcher and packaged runtime have been smoke-tested on Apple Silicon macOS; the native build matrix produces separate macOS Intel, Linux x64, and Windows x64 artifacts. DeepSeek Harness itself remains under rapid development, so configuration, plugins, and persisted data may change before a stable desktop release.

## What the desktop shell does

- Starts the packaged `dsh web` runtime with Electron's embedded Node.js on an operating-system-assigned `127.0.0.1` port.
- Loads only that exact local origin in a sandboxed Electron window.
- Disables renderer Node integration, webviews, insecure content, and permission grants.
- Opens credential-free HTTPS links in the system browser and rejects other external navigation.
- Keeps Harness profiles below Electron's per-user application-data directory and shuts down the owned backend process tree when the app quits.
- Reuses the upstream Harness Web UI and plugin composition without maintaining a second desktop-only frontend.

<a id="run"></a><a id="run-from-source"></a>

## Build from source

Requirements: Git, Node.js 24, and pnpm 11.

```sh
git clone https://github.com/lonesafe/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm run desktop:dist
```

The current platform's installers are written to `dist/desktop`. Native dependencies are selected during installation, so package each target on its own operating system:

```sh
pnpm run desktop:dist:mac
pnpm run desktop:dist:linux
pnpm run desktop:dist:windows
```

The [Desktop installers workflow](.github/workflows/desktop.yml) builds macOS arm64, macOS x64, Linux x64, and Windows x64 in native GitHub-hosted runners. Pushing a `v*` tag attaches the installers to the matching GitHub Release.

## Development and verification

```sh
pnpm run desktop:dev
pnpm --dir apps/desktop run test
pnpm run verify-desktop-runtime-closure
pnpm run build
```

The runtime-closure gate verifies that every required workspace peer needed by the dynamically loaded production plugin graph is present in the packaged application.

## Application data

Harness data lives in the `runtime` child of Electron's standard per-user application-data directory. Uninstalling the application does not automatically delete that data. Back it up before moving between beta versions if the stored sessions matter to you.

## Known beta limitations

- Installers are not code-signed or notarized yet.
- The application is large because it contains Electron and the complete production Harness runtime.
- Automatic updates are not implemented; install a newer Release manually.
- Only x64 Linux and Windows builds are currently published.
- The desktop client inherits upstream Harness developer-preview compatibility changes.

## Upstream and license

The agent runtime, Web UI, and plugin system come from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). Desktop-specific code lives in [`apps/desktop`](apps/desktop), and the architectural decision is recorded in the [Electron desktop launcher note](.agents/notes/implemented/architecture/2026-08-15-electron-desktop-launcher.md).

Distributed under the [MIT License](LICENSE). Third-party notices are available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
