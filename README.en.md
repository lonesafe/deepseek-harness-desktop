# DeepSeek Harness Desktop

[中文](README.md) | English

[![Desktop installers](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml/badge.svg)](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml) [![Release](https://img.shields.io/github/v/release/lonesafe/deepseek-harness-desktop)](https://github.com/lonesafe/deepseek-harness-desktop/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![Views](https://komarev.com/ghpvc/?username=lonesafe-deepseek-harness-desktop&label=Views&color=0e75b6&style=flat)

**Zero runtime setup · Simple to use · Ready out of the box · No development experience required**

Download, install, and open. There is no need to install Node.js, pnpm, Electron, run terminal commands, or start a browser manually. The desktop client includes everything required to run DeepSeek Harness; model-provider credentials can be entered inside the application when needed.

[Download DeepSeek Harness Desktop from the portal](https://dsh.roubsite.com/downloads)

DeepSeek Harness Desktop packages the official open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web experience as a self-contained desktop application for macOS, Linux, and Windows. Electron, Node.js, the production plugin graph, and the Web assets travel inside the installer, so users do not need a development environment.

This is a community-maintained desktop distribution. It is not an official DeepSeek product and is not endorsed by or affiliated with DeepSeek AI.

## Interface preview

![DeepSeek Harness Desktop main interface](assets/deepseek-harness-desktop-interface.jpg)

## Download and start

1. Open the [portal download page](https://dsh.roubsite.com/downloads). Packages are also listed in [GitHub Releases](https://github.com/lonesafe/deepseek-harness-desktop/releases).
2. Download the package for your system.
3. Install and open the application.

| Platform | Architecture | Packages |
|---|---:|---|
| macOS | Apple Silicon | DMG or ZIP |
| macOS | Intel | DMG or ZIP |
| Windows | x64 | NSIS installer or ZIP |
| Linux | x64 | AppImage or DEB |

The release workflow automatically signs, notarizes, and verifies the macOS application when Apple Developer credentials are available. Without a certificate, it still publishes unsigned installers and identifies their status in the release notes. Windows SmartScreen may likewise display an unknown-publisher warning.

### Install and launch an unsigned macOS build

1. Download the DMG for your Mac architecture, open it, and drag **DeepSeek Harness** into **Applications**. For a ZIP, extract it first and then move the application into **Applications**.
2. Do not double-click on the first launch. In Finder's **Applications** folder, Control-click **DeepSeek Harness**, choose **Open**, and select **Open** again in the confirmation dialog.
3. If macOS reports that it cannot verify the developer and blocks the launch, open **System Settings → Privacy & Security**, find the blocked **DeepSeek Harness** entry, select **Open Anyway**, and complete system authentication.
4. These steps are normally required only once. The application can be launched normally afterward; there is no need to disable Gatekeeper globally, and doing so is not recommended.

## Remote access

1. On the first launch, or whenever no account has been authorized, the desktop client offers sign-in or registration and explains that signing in lets you use this computer remotely from a phone or another device. You can skip sign-in and continue using the application locally.
2. After authorization, you can enable **Remote control**. It is off by default and can be managed at any time under **Settings → General → Remote control**. A signed-out user who tries to enable remote control is asked to sign in again, and the feature stays disabled until sign-in completes.
3. Sign in to the portal's **Device Center**, choose an online computer owned by the current account, and select **Connect**. A new browser tab opens where you can continue conversations, inspect tasks, and use the computer's workspace.

## Zero-setup desktop experience

- **No runtime installation:** Electron, Node.js, the production plugin graph, and Web assets are included.
- **No command line:** the desktop launcher starts and stops the local Harness service automatically.
- **No separate browser:** the complete Harness interface opens in its own desktop window.
- **No development experience:** download the native package for macOS, Windows, or Linux and start using it.

## Version updates

The desktop client checks the portal's version center immediately after startup and every 10 minutes afterward. When a new version is available, an update badge appears in the lower-left corner. Selecting it downloads the installer from the portal and shows live download and verification progress in the lower-right corner; the download can be cancelled at any time. The installer is handed to the operating system only after its declared size and SHA-256 digest are verified. Packages are available from both the [official downloads page](https://dsh.roubsite.com/downloads) and [GitHub Releases](https://github.com/lonesafe/deepseek-harness-desktop/releases).

## Beta status

The current desktop beta provides installers for macOS Apple Silicon, macOS Intel, Linux x64, and Windows x64. It includes the desktop runtime, account authorization, remote access, mobile layouts, and portal-hosted version updates. DeepSeek Harness itself remains under rapid development, so configuration, plugins, and persisted data may change before a stable desktop release.

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

### macOS release signing

macOS packaging always enables Hardened Runtime and the entitlements required by Electron. Repository maintainers can configure a complete Apple Developer credential set so a Release is automatically signed and notarized. With all credentials present, the workflow performs signing, notarization, and system verification. With no credentials, it still creates unsigned installers that users can open by following the first-launch steps above. A partial credential set stops the build so an incomplete artifact cannot be mistaken for a signed release.

## Development and verification

```sh
pnpm run desktop:dev
pnpm --dir apps/desktop run test
pnpm run verify-desktop-runtime-closure
pnpm run build
```

## Application data

Harness data lives in the `runtime` child of Electron's standard per-user application-data directory. Uninstalling the application does not automatically delete this data. Back it up before moving between beta versions if the stored sessions matter to you.

## Upstream and license

The agent runtime, Web UI, and plugin system come from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness), and desktop-specific code lives in `apps/desktop`. The project is distributed under the [MIT License](LICENSE).
