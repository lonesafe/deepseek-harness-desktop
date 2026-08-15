# DeepSeek Harness Desktop

[English](README.md) | 中文

[![Desktop installers](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml/badge.svg)](https://github.com/lonesafe/deepseek-harness-desktop/actions/workflows/desktop.yml) [![Release](https://img.shields.io/github/v/release/lonesafe/deepseek-harness-desktop?include_prereleases)](https://github.com/lonesafe/deepseek-harness-desktop/releases) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

DeepSeek Harness Desktop 将官方开源的 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 体验打包成适用于 macOS、Linux 和 Windows 的自包含桌面应用。安装包内含 Electron、Node.js、生产插件图和 Web 资源，用户无需安装 Node.js、pnpm，也无需手动打开浏览器。

这是由社区维护的桌面发行版，并非 DeepSeek 官方产品，也未获得 DeepSeek AI 的认可或隶属关系。

## Beta 状态

`v1.0.0-beta.1` 是首个公开桌面 Beta。启动器和打包运行时已在 Apple Silicon macOS 上完成冒烟测试；原生构建矩阵会分别生成 macOS Intel、Linux x64 和 Windows x64 产物。DeepSeek Harness 本身仍在快速开发，稳定桌面版发布前，配置、插件和持久化数据都可能发生变化。

## 下载

打开 [v1.0.0-beta.1 Release](https://github.com/lonesafe/deepseek-harness-desktop/releases/tag/v1.0.0-beta.1)，选择适合当前系统的安装包：

| 平台 | 架构 | 安装包 |
|---|---:|---|
| macOS | Apple Silicon | DMG 或 ZIP |
| macOS | Intel | DMG 或 ZIP |
| Windows | x64 | NSIS 安装程序或 ZIP |
| Linux | x64 | AppImage 或 DEB |

Beta 安装包尚未签名。macOS 可能需要按住 Control 点击应用并选择**打开**；Windows SmartScreen 可能显示未知发布者警告。安装前请核对 Release 中的校验值。

## 桌面壳的工作方式

- 使用 Electron 内嵌的 Node.js 启动已打包的 `dsh web` 运行时，并监听操作系统分配的 `127.0.0.1` 端口。
- 在沙箱化 Electron 窗口中只加载该精确本地 origin。
- 关闭 renderer Node integration、webview、不安全内容和权限授予。
- 将无凭据的 HTTPS 链接交给系统浏览器打开，并拒绝其他外部导航。
- 把 Harness profile 放在 Electron 逐用户应用数据目录下，并在应用退出时关闭自己拥有的后端进程树。
- 直接复用上游 Harness Web UI 与插件组合，不维护第二套桌面专用前端。

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

## 已知 Beta 限制

- 安装包尚未代码签名或公证。
- 应用体积较大，因为其中包含 Electron 和完整的 Harness 生产运行时。
- 尚未实现自动更新，需要手动安装较新的 Release。
- Linux 与 Windows 目前只发布 x64 构建。
- 桌面客户端会继承上游 Harness 开发者预览阶段的兼容性变化。

## 上游与许可证

智能体运行时、Web UI 和插件系统来自 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)。桌面专用代码位于 [`apps/desktop`](apps/desktop)，架构决策记录在 [Electron 桌面启动器说明](.agents/notes/implemented/architecture/2026-08-15-electron-desktop-launcher.md)中。

项目采用 [MIT 许可证](LICENSE)分发。第三方声明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
