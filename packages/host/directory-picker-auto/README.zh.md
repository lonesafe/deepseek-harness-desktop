---
description: "目录选择 seam 的自适应选择器：启动时判定一次 Host 后端，再让回环与远程桌面页面使用各自可达的交互。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker-auto

[English](README.md) | 中文

## 概述

`dsh-host-directory-picker-auto` 每次启动判定一次 Host 后端，并把它与 client 界面作为真实 Loader 条目挂进内存根树。判定为 browse 时，所有页面都使用应用内浏览器。判定为 native 时，挂载有人值守桌面后端，并把同一 browse 界面配置为：回环页面使用 OS 选择器，远程页面仍使用应用内浏览器。Host 能力在服务生命周期内保持稳定；页面 authority 只决定当前浏览器使用该能力公开的哪一种操作。

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

当一个桌面进程既可能服务本地窗口又可能服务已认证远程页面，或同一组合还要运行于远程与无头环境时，用本插件代替具体后端。选择器在启动时检查一次 Host，并挂载匹配的能力与一套 client 界面。

### 选择是如何作出的

`native` 要求「操作者看得到宿主屏幕、且原生后端能服务它」的全部信号：仅回环的绑定（从注入的 `webServer` 读取；全网卡绑定会接入任何 OS 选择器都触及不到的远程浏览器）；非 SSH 启动（`SSH_CONNECTION`／`SSH_TTY` 未设置或为空）；以及可服务的显示会话——darwin 与 win32 上视为存在；linux 上要求 `DISPLAY`／`WAYLAND_DISPLAY`，外加 `PATH` 上有 zenity 或 kdialog 二进制；其余任何平台上都不成立。任何含糊情形都判定为处处可用的 `browse`。

### 你会得到什么

后端与 client 界面以普通 Loader 条目的形式到达。判定为 browse 时，后端公开列举与创建，界面始终渲染应用内浏览器。判定为 native 时，后端公开稳定的 `adaptive` 能力，界面按 `ctx.remote.$host.isLoopback` 选择：本地窗口用原生 `pick`，远程页面用列举与创建。client 模块表发现该界面的方式与配置行完全相同。卸载选择器会移除两个条目并汇入其拆卸。

### 固定某种交互

固定交互在这里不是配置字段：直接组合 `-native` 或 `-browse` 行来替代本行——那才是 seam 文档化的切换点。同时挂载选择器**和**某个后端行会明确报错（重复的 `directoryPicker` 服务、`single` 类 slot 中的重复 client 流程）。

### 可观察的失败

本地原生选择失败会进入既有的可重试失败对话框。远程页面绝不会尝试特权 native 调用，仍使用应用内浏览器。Host 探查无法确认显示可用时，直接组合 `-browse` 即让所有页面都使用该交互。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 设计理念

选择器是一次纯决策加一次挂载：`resolveDirectoryPickerBackend` 在启动时采样 Host 事实并返回后端类型，`apply` 把后端与界面作为真实 Loader 条目挂进内存根树——绝不持久化到配置文件，因为根树的 `write()` 是 no-op。两种判定都使用 `dsh-client-ui-directory-picker-browse`；仅 native 判定传入 `nativeOnLoopback: true`。该 effect 的 disposer 会移除两个条目并汇入其 fiber 的拆除。

### 判定表

| 条件 | 后端 |
|---|---|
| 绑定宿主不是 `127.0.0.1` | `browse` |
| 存在 `SSH_CONNECTION` 或 `SSH_TTY` | `browse` |
| darwin 或 win32 | `native` |
| linux 且带选择器二进制与显示 | `native` |
| 其他任何情况 | `browse` |

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 插件入口：`BACKEND_PACKAGES`／`SURFACE_PACKAGES` 映射、`apply` 挂载与卸载 |
| [`src/resolve.ts`](src/resolve.ts) | `resolveDirectoryPickerBackend`——纯函数的启动时决策 |
| [`src/probe.ts`](src/probe.ts) | 宿主探查：`hasLinuxChooserBinary`、`canExecute` |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当选择器的约定不够用时阅读以下内容：先看 seam 定义，再看它挂载的两个后端。

- [目录选择 seam](../directory-picker/README.zh.md)——选择器所组合的能力约定。
- [目录选择能力 seam 决策](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.zh.md)——后端为何在交互形态上彼此不同。
- [原生后端](../directory-picker-native/README.zh.md)——为本地操作者挂载的交互。
- [浏览后端](../directory-picker-browse/README.zh.md)——在其他任何地方挂载的交互。

-----

<a id="model-experience"></a>
## 模型体验

无。GUI 宿主的目录选择选择器只挂载一个后端行，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明启动时采样何时会误判宿主。它们是当前包约束，不是任务积压。

- **探测可能高估显示可用性**——从 SSH 启动中脱离的 tmux 会话会丢失 `SSH_*` 标记；Aqua 会话之外的 Darwin 进程仍被算作有显示。这只影响回环页面：即使 Host 判定为 `native`，远程页面也使用应用内浏览器。错误的本地选择会进入可重试失败对话框；直接组合 `-browse` 可让所有页面都选择安全交互。
- **Linux 选择器探查只读 `PATH`**——以其他途径可用的 zenity／kdialog（shell 别名、未装在 PATH 上）仍判定为 `browse`；把任一二进制装到 `PATH` 上，下次启动即恢复 `native` 资格。
- **Host 只在启动时判定**——显示与 SSH 状态变化不会在重启前替换已挂载能力。页面级可达性仍是动态的：每个页面各自使用现有回环 authority 选择 native 或 browse，而不改变 Host 服务。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
