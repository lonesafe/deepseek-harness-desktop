# Agent Note: Electron 桌面启动器与原生打包

Status: implemented

[English](2026-08-15-electron-desktop-launcher.md) | 中文

## 问题

DeepSeek Harness 已有完整的浏览器应用，但要求用户安装 Node.js、pnpm 并启动 `dsh web` 并不是桌面客户端体验。可分发应用必须自带生产运行时、保留现有插件组合、管理启动与关闭，并为 macOS、Linux 和 Windows 生成原生产物，同时不能把 Electron renderer 变成拥有 Node 权限的进程。

## 决策

`apps/desktop` 是 Electron 主进程应用。它设置 `ELECTRON_RUN_AS_NODE=1`，复用 Electron 内嵌可执行文件，以 `node --expose-internals <dsh-entry> web --port 0` 启动已打包的 `@deepseek-ai/dsh` 入口；该 Node 标志提供已发布 HMR 插件所需的 loader internals。现有 Web 组合只绑定 `127.0.0.1`；启动器等待就绪输出、加载该精确随机 origin，并在应用退出时终止自己拥有的进程树。Harness 状态使用 Electron 逐用户应用数据目录下的 `runtime` 子目录，使 Electron socket 与缓存永远不会进入 Harness 文件监视范围；初始 workspace 位置则使用用户主目录。

BrowserWindow 开启 context isolation 与 renderer sandbox，关闭 Node integration、webview、权限授予和不安全内容，只允许在受管 origin 内导航。无凭据的 HTTPS 链接可以交给系统浏览器打开，其他外部目标一律拒绝。启动器不暴露 preload API。

electron-builder 运行前，pnpm 会先部署桌面包。因为自动 peer 安装已关闭，其 manifest 显式提供可达生产图中的全部必需 workspace peer；`verify-runtime-closure.ts --manifest apps/desktop/package.json` 保证这个仅依赖闭包保持完整。打包不使用 asar，使内嵌 Node 进程可以直接执行 ESM CLI 并加载其运行时资源；它也不会重新构建已暂存的 pnpm 依赖树。

`desktop:dist` 打包当前平台。原生 GitHub Actions 矩阵分别在 macOS arm64、macOS x64、Linux x64 和 Windows x64 上安装和打包，依次生成 DMG/ZIP、AppImage/DEB 与 NSIS/ZIP 产物。签名与公证不属于默认承诺：只有未来发布环境提供平台凭据与签名策略时，产物才会签名。

## 验证

单元测试固定就绪信息解析、有界子进程关闭、精确 origin 导航和外链策略。运行时闭包门禁遍历 workspace 依赖与必需 peer。暂存运行时冒烟测试从部署后的生产目录启动 `dsh web` 并抓取生成的应用页面；随后平台打包测试通过已打包可执行文件运行内嵌运行时。

## 考虑过的替代方案

**把桌面载体改写为 file URL 加 IPC。** 这能移除回环监听，但会复制成熟的 HTTP／WebSocket 载体，并要求新增 fetch、upgrade、插件 bundle 和静态资源路径。受控回环 origin 保留现有应用协议，同时把暴露范围限制在本机。

**要求用户另行安装 Node.js 运行时。** 这样下载体积更小，但启动会依赖用户的 PATH 与运行时版本。复用 Electron 内嵌 Node 运行时可以让桌面产物自包含。

**在一台主机上交叉编译全部平台。** 生产依赖图包含平台相关的原生模块和可选模块。原生 runner 会安装正确的依赖变体，避免把打包主机的二进制文件装进另一目标。

**为 renderer 开启 Node integration。** 直接访问进程能力会简化启动，但 renderer 一旦被攻破就会直接变成本地代码执行。进程所有权留在隔离的 Electron 主进程中。

## 后果

用户获得常规桌面应用，无需另装 Node.js、pnpm、终端或浏览器；Web 与桌面产品仍共享同一套 UI 和后端组合。启动错误会包含有界的子进程诊断；一个应用实例拥有一个本地后端；退出时不会有意遗留该后端。

代价是产物体积：Electron 加显式 Harness 运行时闭包远大于单独的 Web 资源，且 `asar: false` 会生成可直接查看的资源树。应用仍会短暂开放一个随机回环监听端口，不过它只绑定 `127.0.0.1`，且特权窗口只接受其精确 origin。平台签名、公证和软件仓库发布仍属于发布基础设施职责，不是本地构建自带的性质。
