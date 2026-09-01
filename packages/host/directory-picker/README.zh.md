---
description: "面向 web GUI Host 的工作区目录选择 seam：固定 native 与 browse 交互、adaptive 桌面能力及带类型的 browse 错误。"
kind: "package-reference"
---

# @deepseek-ai/dsh-host-directory-picker

[English](README.md) | 中文

## 概述

web GUI Host 通过一项服务让操作者选择工作区目录；其唯一方法报告当前组合的交互。固定 native provider 打开 OS 选择器，固定 browse provider 为应用内浏览器提供列举与创建，而有人值守桌面把两者作为一份稳定的 adaptive 能力公开，让回环窗口与已认证远程页面在不替换 Host 服务的前提下使用可达交互。消费方按能力类型分支。该 seam 只服务 GUI Host，绝不进入 agent loop。

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

挂载且只挂载一个目录选择后端，然后让工作区流程驱动它：seam 本身只是服务约定，因此没有后端的组合就无从选择目录。

### 选择后端

[有人值守桌面后端](../directory-picker-native/README.zh.md)向回环页面公开原生选择，向远程页面公开浏览操作。[浏览后端](../directory-picker-browse/README.zh.md)处处可用，是无头或仅远程 Host 的固定选择。当同一应用组合必须在启动时判定这项 Host 级选择时，组合[自适应选择器](../directory-picker-auto/README.zh.md)。

### 能力约定

`capability()` 返回一个可辨识联合类型：固定 OS 选择器为 `{ kind: 'native', pick(signal) }`，固定应用内浏览器为 `{ kind: 'browse', list(path?), createDirectory(path, name) }`，有人值守桌面为 `{ kind: 'adaptive', pick(signal), list(path?), createDirectory(path, name) }`。消费方按 `kind` 分支；未知能力会隐藏入口而非失败。浏览失败抛出 `DirectoryPickerError`，封闭错误码为 `directory-unreadable`、`directory-exists` 与 `directory-create-failed`。

### 行携带什么

`DirectoryEntry` 行暴露绝对 `path` 与宿主判定的 `hidden` 标志（POSIX 上为点前缀约定），展示策略留在客户端；客户端绝不自行拼接路径段。`DirectoryListing.crumbs` 是从文件系统根到被列举目录的祖先链——每个 crumb 都是跳转目标，根 crumb 以完整路径标注。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

### 设计理念

该 seam 建立在一个分离之上：后端提供的交互形态是约定，而不是实现细节。`DirectoryPicker` 是只有一个 `capability()` 方法的抽象 Cordis 服务；后端子类以 `ctx.directoryPicker` 注册，加载第二个实现会抛出标准的重复服务错误。能力对象在服务生命周期内必须保持稳定，因为消费方可能跨调用持有它。

### 可合并扩展的词汇表

`DirectoryPickerCapabilities` 是以能力类型为键的可合并扩展映射，`DirectoryPickerCapability` 从它派生联合类型。当前映射包含 `native`、`browse` 与 `adaptive`；未来 provider 通过声明合并加入条目，而不是替换联合。client 界面是与 Host 后端并列挂载的独立包：auto 选择器把 adaptive 后端与配置为仅在回环页面选择 native 的 browse 界面配对。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | Service Definition：抽象 `DirectoryPicker`、能力词汇、类型化错误、Context 合并 |

### 失败词汇

`DirectoryPickerError` 携带封闭的 `DirectoryPickerErrorCode` 加出错对象的绝对路径，消费方无需字符串匹配即可映射业务错误码。设计依据、与 `ctx.fs` 的切分与策略裁决见 seam Agent Note。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当 seam 约定不够用时阅读以下内容：先看决策记录，再看组合它的两个后端与自适应选择器。

- [目录选择能力 seam 决策](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.zh.md)——设计依据、`ctx.fs` 切分与策略裁决。
- [有人值守桌面后端](../directory-picker-native/README.zh.md)——adaptive 交互及其原生平台工具。
- [浏览后端](../directory-picker-browse/README.zh.md)——面向远程客户端的应用内列举与创建交互。
- [自适应选择器](../directory-picker-auto/README.zh.md)——Host 级启动判定与页面级交互选择。
- [工作区子系统](../../../docs/subsystems/workspace.zh.md)——被选目录所喂给的工作区记录。

-----

<a id="model-experience"></a>
## 模型体验

无。GUI 宿主的目录选择 seam 不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明 seam 约定何时把决定留给未来的消费方。它们是当前包约束，不是任务积压。

- **不支持多根目录**——浏览约定每次列举只公开一条祖先链；按部署限定浏览根（以及在盘符根的上一级枚举 Windows 各盘符根目录）等到出现需要它的消费方再做，见 DirectoryPicker Agent Note。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
