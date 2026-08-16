# @deepseek-ai/dsh-host-directory-picker

[English](README.md) | 中文

web GUI 宿主的工作区目录选择是一项能力 seam。抽象的 `DirectoryPicker` 服务（`ctx.directoryPicker`）是其 Service Definition。该服务只提供 `capability()`，返回说明操作者如何选择目录的可辨识联合类型。后端差异在于用户交互：`{ kind: 'native', pick(signal) }` 打开原生 OS 选择器；`{ kind: 'browse', list(path?), createDirectory(path, name) }` 提供应用内浏览器；`{ kind: 'adaptive', pick(signal), list(path?), createDirectory(path, name) }` 则让同一台有人值守的桌面宿主同时服务回环桌面窗口与远程浏览器（[`-native`](../directory-picker-native/README.md)）。消费方按 `capability().kind` 分支；联合类型由可合并扩展的 `DirectoryPickerCapabilities` 映射派生，能力对象在服务生命周期内保持稳定。需要在运行时选择交互的组合挂载 [`-auto`](../directory-picker-auto/README.md)，由它在启动时检查一次宿主情况、挂载后端，并按当前页面是否回环访问来选择 client 交互。

浏览原语失败时会抛出带类型的 `DirectoryPickerError`（`directory-unreadable`／`directory-exists`／`directory-create-failed`，各自携带出错对象的 `path`），消费网关将其 1:1 映射为协议错误码。`DirectoryEntry` 行携带宿主判定的 `hidden` 标志（POSIX 点前缀约定），展示策略留在客户端；`DirectoryListing.crumbs` 是从文件系统根开始的祖先链，每个 crumb 都是跳转目标。设计依据、与 `ctx.fs` 的切分、策略裁决见 [目录选择能力 seam Agent Note](../../../.agents/notes/implemented/architecture/2026-07-28-directory-picker-capability-seam.md)。

## 模型体验

无。该 seam 服务于 GUI 宿主的目录选择；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **不支持多根目录**——浏览约定每次列举只公开一条祖先链；按部署限定可浏览根（以及在盘符根的上一级枚举 Windows 各盘符根目录）等到出现需要它的消费方再做，见 DirectoryPicker Agent Note。
