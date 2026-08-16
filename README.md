# DeepSeek Harness Desktop

[English](README.en.md) | 中文

[![Desktop installers](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml/badge.svg)](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml) [![Release](https://img.shields.io/github/v/release/lonesafe/deepseek-harness-desktop?include_prereleases)](https://github.com/lonesafe/deepseek-harness-desktop/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE) ![访问量](https://komarev.com/ghpvc/?username=lonesafe-deepseek-harness-desktop&label=%E8%AE%BF%E9%97%AE%E9%87%8F&color=0e75b6&style=flat)

**运行环境零配置 · 简单易用 · 开箱即用 · 零开发门槛**

下载安装后直接打开，无需安装 Node.js、pnpm、Electron，无需执行终端命令，也无需手动启动浏览器。桌面客户端已经包含运行 DeepSeek Harness 所需的完整环境；需要调用模型时，可直接在应用内填写服务商要求的凭据。

[从官网下载 DeepSeek Harness Desktop](https://dsh.roubsite.com/downloads)

DeepSeek Harness Desktop 将官方开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 体验打包成适用于 macOS、Linux 和 Windows 的自包含桌面应用。安装包内含 Electron、Node.js、生产插件图和 Web 资源，用户无需安装 Node.js、pnpm，也无需手动打开浏览器。

这是由社区维护的桌面发行版，并非 DeepSeek 官方产品，也未获得 DeepSeek AI 的认可或隶属关系。

## 界面预览

![DeepSeek Harness Desktop 中文主界面](assets/deepseek-harness-desktop-interface.jpg)

## 下载并开始使用

1. 打开[官网客户端下载页](https://dsh.roubsite.com/downloads)；也可以查看 [GitHub Releases](https://github.com/lonesafe/deepseek-harness-desktop/releases)。
2. 下载适合当前系统的安装包。
3. 安装并打开应用。

| 平台 | 架构 | 安装包 |
|---|---:|---|
| macOS | Apple Silicon | DMG 或 ZIP |
| macOS | Intel | DMG 或 ZIP |
| Windows | x64 | NSIS 安装程序或 ZIP |
| Linux | x64 | AppImage 或 DEB |

发布流水线会在具备 Apple Developer 凭据时自动签名、公证并验证 macOS 应用；没有证书时仍会发布未签名安装包，并在 Release 说明中标明状态。Windows SmartScreen 也可能显示未知发布者警告。

### macOS 未签名版本安装与首次启动

1. 下载与 Mac 架构对应的 DMG，打开后把 **DeepSeek Harness** 拖入**应用程序**文件夹；如果下载 ZIP，请先解压，再把应用移入**应用程序**。
2. 首次启动不要直接双击。在访达的**应用程序**中按住 Control 点击 **DeepSeek Harness**，选择**打开**，然后在确认窗口中再次点击**打开**。
3. 如果系统只提示无法验证开发者并阻止启动，请打开**系统设置 → 隐私与安全性**，在安全性区域找到被阻止的 **DeepSeek Harness**，点击**仍要打开**并完成系统验证。
4. 上述操作通常只需执行一次，之后可以像普通应用一样启动。无需也不建议全局关闭 Gatekeeper。

## 远程访问

需要从外网手机或其他浏览器使用自己的电脑的dsh时：

1. 首次启动或尚未授权账号时，桌面客户端会提示登录或注册，并说明登录后可以从手机或其他设备远程使用这台电脑。用户可以暂不登录并继续在本机使用。登录和注册在系统浏览器打开的官网中完成，桌面客户端不会读取官网密码。
2. 网页确认设备授权后返回桌面客户端，程序会询问是否**开启远程控制**。该功能默认关闭；开启后电脑主动建立加密出站连接，无需公网 IP、端口映射或路由器设置。之后也可以在**设置 → 通用设置 → 远程控制**中管理，或通过 **DeepSeek Harness**／**应用**菜单中的**远程访问…**修改设置和重新授权。未登录用户开启远程控制时会再次看到登录授权提示，授权完成前无法使用远程控制。
3. 登录官网的**设备中心**，选择属于当前账号的在线电脑并点击**连接**。

## 为什么能够零配置使用

- **无需安装运行环境：**安装包已经包含 Electron、Node.js、生产插件图和 Web 资源。
- **无需使用命令行：**桌面启动器会自动启动和关闭本地 Harness 服务。
- **无需单独打开浏览器：**完整的 Harness 界面会直接显示在桌面窗口中。
- **无需开发环境：**下载适用于 macOS、Windows 或 Linux 的原生安装包即可开始使用。

## 版本更新

桌面客户端启动后会立即向官网版本中心检查新版本，之后每隔 10 分钟检查一次。发现新版本时，左下角**设置**右侧会显示**更新**标识；点击后由桌面客户端从官网下载安装包，右下角实时显示下载与校验进度，并可随时取消和清理未完成文件。安装包通过文件大小和 SHA-256 完整性校验后才会交给系统打开。官网的[客户端下载页](https://dsh.roubsite.com/downloads)也会列出各平台、架构、文件大小和 SHA-256。客户端更新下载不依赖 GitHub。

## Beta 状态

当前为桌面 Beta 版本，提供 macOS Apple Silicon、macOS Intel、Linux x64 和 Windows x64 安装包，并包含桌面运行环境、远程访问、移动端适配、工作区文件预览和官网版本更新能力。DeepSeek Harness 本身仍在快速开发，稳定桌面版发布前，配置、插件和持久化数据都可能发生变化。

<a id="run"></a><a id="run-from-source"></a>

## 从源码构建

需要 Git、Node.js 24 和 pnpm 11。

```sh
git clone https://github.com/lonesafe/deepseek-harness-desktop.git
cd deepseek-harness-desktop
pnpm install
pnpm run desktop:dist
```

当前平台的安装包会写入 `dist/desktop`。原生依赖会在安装阶段按平台选择，因此每个目标都应在对应操作系统上打包：

```sh
pnpm run desktop:dist:mac
pnpm run desktop:dist:linux
pnpm run desktop:dist:windows
```

[桌面安装包工作流](.github/workflows/desktop.yml)使用 GitHub 原生 runner 构建 macOS arm64、macOS x64、Linux x64 和 Windows x64。推送 `v*` 标签后，工作流会把安装包附加到对应 GitHub Release。

### macOS 发布签名

macOS 打包始终启用 Hardened Runtime 和 Electron 所需的 entitlements。仓库维护者可以在 GitHub Actions Secrets 中配置以下完整凭据，使 Release 自动使用 `Developer ID Application` 签名并完成 Apple 公证：

- `MACOS_CERTIFICATE_P12_BASE64`：Developer ID Application `.p12` 的 Base64 内容。
- `MACOS_CERTIFICATE_PASSWORD`：导出 `.p12` 时设置的密码。
- `APPLE_API_KEY_P8`：App Store Connect API Key 的 `.p8` 内容。
- `APPLE_API_KEY_ID`：API Key ID。
- `APPLE_API_ISSUER`：Issuer ID。

五项凭据全部存在时，工作流只在临时 runner 中注入它们，完成签名和公证后执行 `codesign --verify`、`spctl --assess` 与 `stapler validate`；验证失败就停止该 macOS 构建。五项凭据全部缺失时，工作流仍会生成并发布未签名安装包，用户按上面的首次启动步骤打开即可。只配置部分凭据会被视为配置错误并停止构建，避免误以为产物已经签名。本地执行 `desktop:dist:mac` 而未配置凭据时，同样得到未签名安装包。

## 开发与验证

```sh
pnpm run desktop:dev
pnpm --dir apps/desktop run test
pnpm run verify-desktop-runtime-closure
pnpm run build
```

运行时闭包门禁会验证：动态加载的生产插件图所需的每个 workspace peer 都已进入打包后的应用。

## 应用数据

Harness 数据位于 Electron 标准逐用户应用数据目录的 `runtime` 子目录。卸载应用不会自动删除这些数据。如果已保存的会话很重要，请在不同 Beta 版本之间迁移前进行备份。

## 上游与许可证

智能体运行时、Web UI 和插件系统来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。桌面专用代码位于 [`apps/desktop`](apps/desktop)，架构决策记录在 [Electron 桌面启动器说明](.agents/notes/implemented/architecture/2026-08-15-electron-desktop-launcher.md)和[账号设备中转说明](.agents/notes/implemented/feature/2026-08-15-account-device-remote-relay.md)中。

项目采用 [MIT 许可证](LICENSE)分发。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
