# DeepSeek Harness Desktop

[中文](README.md) | English

[![Desktop installers](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml/badge.svg)](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml) [![Release](https://img.shields.io/github/v/release/lonesafe/deepseek-harness-desktop?include_prereleases)](https://github.com/lonesafe/deepseek-harness-desktop/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![Views](https://komarev.com/ghpvc/?username=lonesafe-deepseek-harness-desktop&label=Views&color=0e75b6&style=flat)

**Zero runtime setup · Simple to use · Ready out of the box · No development experience required**

Download, install, and open. There is no need to install Node.js, pnpm, Electron, run terminal commands, or start a browser manually. The desktop client includes everything required to run DeepSeek Harness; model-provider credentials can be entered inside the application when needed.

[Download DeepSeek Harness Desktop from the portal](https://dsh.roubsite.com/downloads)

DeepSeek Harness Desktop packages the official open-source [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web experience as a self-contained desktop application for macOS, Linux, and Windows. Electron, Node.js, the production plugin graph, and the Web assets travel inside the installer, so users do not need to install Node.js, pnpm, or launch a browser.

This is a community-maintained desktop distribution. It is not an official DeepSeek product and is not endorsed by or affiliated with DeepSeek AI.

## Interface preview

![DeepSeek Harness Desktop main interface](assets/deepseek-harness-desktop-interface.jpg)

## Download and start

1. Open the [official client downloads page](https://dsh.roubsite.com/downloads). Packages are also listed in [GitHub Releases](https://github.com/lonesafe/deepseek-harness-desktop/releases).
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
3. If macOS only reports that it cannot verify the developer and blocks the launch, open **System Settings → Privacy & Security**, find the blocked **DeepSeek Harness** entry in the Security section, select **Open Anyway**, and complete system authentication.
4. These steps are normally required only once. The application can be launched normally afterward; there is no need to disable Gatekeeper globally, and doing so is not recommended.

## Remote access

To use DSH on your computer from a phone or another browser outside its network:

1. On the first launch, or whenever no account has been authorized, the desktop client offers sign-in or registration and explains that signing in lets you use this computer remotely from a phone or another device. You can skip sign-in and continue using the application locally. Sign-in and registration happen on the portal in the system browser, and the desktop client never reads the portal password.
2. After the Web page approves the device, return to the desktop client and choose whether to **Enable remote control**. This setting is off by default. When enabled, the computer creates an encrypted outbound connection without requiring a public IP, port forwarding, or router changes. You can later manage it from **Settings → General → Remote control**, or change the setting and authorize another account from **Remote Access…** in the **DeepSeek Harness** or **Application** menu. If a signed-out user tries to enable remote control, the application asks for login and authorization again; remote control remains unavailable until authorization succeeds.
3. Sign in to the portal's device center, choose an online computer owned by the current account, and select **连接**.

## Why it is zero setup

- **No runtime installation:** Electron, Node.js, the production plugin graph, and Web assets are included.
- **No command line:** the desktop launcher starts and stops the local Harness service automatically.
- **No separate browser:** the complete Harness interface opens in its own desktop window.
- **No development setup:** download the native package for macOS, Windows, or Linux and start using it.

## Version updates

The desktop client checks the portal's version center immediately after startup and every 10 minutes afterward. When a new version is available, an **Update** badge appears to the right of **Settings** in the lower-left corner. Selecting it downloads the installer from the portal and shows live download and verification progress in the lower-right corner; the download can be cancelled at any time and its incomplete file is removed. The installer is handed to the operating system only after its declared size and SHA-256 digest are verified. The [official downloads page](https://dsh.roubsite.com/downloads) also lists packages by platform and architecture together with their size and SHA-256 digest. Client updates do not use GitHub as their download source.

## Beta status

The current desktop beta provides installers for macOS Apple Silicon, macOS Intel, Linux x64, and Windows x64. It includes the desktop runtime, remote access, mobile layouts, Workspace file previews, and portal-hosted version updates. DeepSeek Harness itself remains under rapid development, so configuration, plugins, and persisted data may change before a stable desktop release.

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

macOS packaging always enables Hardened Runtime and the entitlements required by Electron. Repository maintainers can configure the complete set of GitHub Actions Secrets below to make a release use a `Developer ID Application` identity and Apple notarization automatically:

- `MACOS_CERTIFICATE_P12_BASE64`: Base64 content of the Developer ID Application `.p12`.
- `MACOS_CERTIFICATE_PASSWORD`: password used when exporting the `.p12`.
- `APPLE_API_KEY_P8`: content of the App Store Connect API Key `.p8`.
- `APPLE_API_KEY_ID`: API Key ID.
- `APPLE_API_ISSUER`: Issuer ID.

When all five credentials are present, the workflow injects them only into the temporary runner, signs and notarizes the application, and verifies it with `codesign --verify`, `spctl --assess`, and `stapler validate`; a failed verification stops that macOS build. When all five credentials are absent, the workflow still builds and publishes unsigned installers, which users can open with the first-launch steps above. A partial credential set is treated as a configuration error and stops the build so the artifact cannot be mistaken for a signed one. Running `desktop:dist:mac` locally without credentials likewise produces an unsigned installer.

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

## Upstream and license

The agent runtime, Web UI, and plugin system come from [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness). Desktop-specific code lives in [`apps/desktop`](apps/desktop); the decisions are recorded in the [Electron desktop launcher note](.agents/notes/implemented/architecture/2026-08-15-electron-desktop-launcher.md) and [account device relay note](.agents/notes/implemented/feature/2026-08-15-account-device-remote-relay.md).

Distributed under the [MIT License](LICENSE). Third-party notices are available in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
