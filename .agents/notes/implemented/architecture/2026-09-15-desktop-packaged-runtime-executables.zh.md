# Agent Note: 分离 Desktop Host 与包管理器可执行文件

Status: implemented

[English](2026-09-15-desktop-packaged-runtime-executables.md) | 中文

## 问题

独立 Desktop 发行版把生产 JavaScript 归档到 ASAR。上游 Node 无法读取 Electron 的虚拟归档路径。另一方面，若把 Electron 可执行文件作为普通 Node 二进制启动 pnpm，除非选定 Node 模式，否则会启动应用；它所在目录也不提供包生命周期脚本需要的 `node` 命令。

## 决策

打包 Desktop 通过 `process.execPath` 和 `ELECTRON_RUN_AS_NODE=1` 启动私有 Host。它通过 `app.getAppPath()` 解析归档的 dsh 项目，并选择不可变的 [profile 解析代际](2026-09-09-profile-resolution-generations.zh.md)，无需创建指向 ASAR 内部的目录链接。

插件管理器继续使用 `process.resourcesPath` 下单独内置的上游 Node 可执行文件和 pnpm 入口。包操作把该 Node 目录置于受控 `PATH` 前端，使获准的生命周期脚本解析到同一个普通运行时。开发模式的 Host 和包管理器都使用显式 Node 覆盖项。

本决策替代[内置运行时记录](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)中仅使用上游 Node 的 Host 和不归档核心包的选择。该记录继续负责包归属、筛选、事务和插件保留。profile 解析记录继续负责解析优先级和 Worker 传播。没有记录被完全取代。分支仓库的 `desktop:dist` Web 发行版保留独立的打包器和启动入口。

## 考虑过的替代方案

- 单个可执行文件字段无法同时表达 ASAR Host 访问和 pnpm 脚本需要的普通 `node` 命令。
- 把完整核心保留在 ASAR 外可以继续用上游 Node 启动，但会丢弃归档分发及其运行时解析支持。
- 使用系统 Node 和 pnpm 会让首次启动及插件管理依赖用户配置。

## 影响

发行版仍携带 Electron、上游 Node 和 pnpm。原生模块必须在实际加载它们的 Host 运行时下验证。启动测试断言两条可执行文件路径及运行时解析，包管理器测试验证安装与生命周期构建。各平台签名产物仍需完成发布验收。
