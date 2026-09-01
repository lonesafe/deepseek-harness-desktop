---
description: "目录选择 seam 的有人值守桌面后端：为回环页面提供原生选择，为远程页面提供目录列举与创建。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | 中文

## 概述

`dsh-host-directory-picker-native` 是有人值守桌面后端：它注册一份稳定的 `adaptive` 能力，同时包含回环页面所用的原生 OS 选择器，以及已认证远程页面进行应用内浏览所需的列举与创建原语。macOS 驱动 `osascript`，Linux 使用 Zenity 并以 KDialog 回退，Windows 在 spawn 的子进程中打开现代 `IFileOpenDialog`。[自适应选择器](../directory-picker-auto/README.zh.md)只在 Host 有可服务显示时挂载本后端，并把它与 browse client 界面配对，由该界面逐页选择可达交互。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

为可能同时服务本地窗口与远程浏览器的有人值守桌面组合此后端。回环工作区流程每次 open 请求调用一次 `pick(signal)`；远程流程通过应用内浏览器调用 `list(path?, signal)` 与 `createDirectory(path, name)`。能力对象与三种操作的 identity 在服务生命周期内保持稳定。

### 何时选择

为 macOS、Windows 或桌面 Linux 上有人值守的工作站选择此后端，包括接受已认证远程浏览器的工作站。对没有可用显示的 SSH 与无人值守宿主，选择[浏览后端](../directory-picker-browse/README.zh.md)。[自适应选择器](../directory-picker-auto/README.zh.md)在启动时作出这项 Host 级判定；即使判定为 native，远程页面也继续使用 browser 交互。

### 操作者会看到什么

回环页面在 Host 屏幕上打开一个原生选择器并等待操作者；中止调用方信号会终止选择器进程，而不是让它留在屏幕上。Linux 上选择器需要安装 Zenity 或 KDialog 之一。远程页面绝不在该屏幕上打开对话框：配对的 browse 界面通过同一份 adaptive 能力列出、导航并创建目录。

### 可观察的失败

原生取消返回 `null`，不是错误。平台工具缺失、选择器启动失败或本地 pick 被中止都会以界面可以呈现的拒绝形式浮现。远程浏览错误保留带类型的目录选择失败词汇。没有可用本地原生交互时，[浏览后端](../directory-picker-browse/README.zh.md)仍是 Host 级选择。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 设计理念

`NativeDirectoryPicker` 把两份维护中的实现组合到一份稳定的 `adaptive` 能力之后。`pick` 转发给 `pickNativeDirectory`；`list` 与 `createDirectory` 转发给 `dsh-host-directory-picker-browse` 创建的 browse 能力。原生选择器以子进程运行，Host 进程不会因对话框阻塞。命令边界（`DirectoryPickerRunner`）与平台事实可注入；共享的免 shell 子进程运行器位于 [`dsh-native-command`](../../util/native-command/README.zh.md)。

### 平台机制

平台工具不经 shell 调用：macOS 使用 `osascript`，Linux 使用 Zenity 并以 KDialog 回退；调用方的中止信号会终止原生进程。Windows 在 spawn 的子进程中打开现代 `IFileOpenDialog`——由 koffi 在子进程主线程上驱动的 COM 会话，采用宿主接受的最佳线程 DPI 感知（优先 per-monitor-v2），中止时向对话框线程投递 `WM_CLOSE`。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：持有稳定 `adaptive` 能力的 `NativeDirectoryPicker` 服务 |
| [`src/native-picker.ts`](src/native-picker.ts) | 选择器分发：平台选择、子进程运行、中止接线 |
| [`src/win32-dialog.ts`](src/win32-dialog.ts) 及同族文件 | Windows 经 koffi 的子进程 `IFileOpenDialog`、DPI 处理、`WM_CLOSE` 中止 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当后端约定不够用时阅读以下内容：先看 seam 定义，再看替代后端与在两者之间选择的那个选择器。

- [目录选择 seam](../directory-picker/README.zh.md)——`adaptive` 能力约定与类型化错误词汇。
- [目录选择能力 seam 决策](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.zh.md)——后端为何在交互形态上彼此不同。
- [浏览后端](../directory-picker-browse/README.zh.md)——面向远程客户端的应用内替代方案。
- [自适应选择器](../directory-picker-auto/README.zh.md)——native 与 browse 之间的启动时判定。
- [免 shell 子进程运行器](../../util/native-command/README.zh.md)——选择器运行所依赖的共享子进程原语。

-----

<a id="model-experience"></a>
## 模型体验

无。GUI 宿主的目录选择后端不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明原生交互何时不可用或易碎。它们是当前包约束，不是任务积压。

- **Linux 的回环原生选择依赖桌面工具**——Zenity 与 KDialog 均未安装时，`pick` 以包含解决建议的错误拒绝。远程页面仍可浏览；auto 选择器的启动探查发现两者均不存在时，会判定为固定 browse 后端。
- **Windows 没有原生机制级回退**——通过打包依赖 koffi 运行的子进程选择器是唯一原生层级，因此 COM 拒绝或对话框崩溃会向回环页面上报。远程浏览不依赖该层级。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
