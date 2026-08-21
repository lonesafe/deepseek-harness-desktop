# @deepseek-ai/dsh-host-directory-picker-native

[English](README.md) | 中文

[目录选择 seam](../directory-picker/README.zh.md) 的**有人值守桌面后端**：`NativeDirectoryPicker` 注册 `adaptive` 能力。`pick(signal)` 为回环桌面窗口打开原生选择器，`list` 与 `createDirectory` 则服务于连接同一桌面 Host 的远程页面所使用的应用内浏览器。平台工具不经 shell 调用：macOS 使用 `osascript`，Linux 使用 Zenity 并以 KDialog 回退；调用方的中止信号会终止原生进程。Windows 在 spawn 的子进程中打开现代 `IFileOpenDialog`——由 koffi 在子进程主线程上驱动 COM 会话，采用宿主接受的最佳线程 DPI 感知（优先 per-monitor-v2），中止时向对话框线程投递 `WM_CLOSE`。命令边界（`DirectoryPickerRunner`）与平台事实可注入。共享的免 shell 子进程运行器位于 [`dsh-native-command`](../../util/native-command/README.zh.md)。

[`dsh-host-directory-picker-auto`](../directory-picker-auto/README.zh.md) 在 adaptive 模式下把本后端与 browse client 界面配对：该界面只在回环页面调用 `host.pickDirectory`，其他情况则通过 `host.listDirectory` 与 `host.createDirectory` 渲染目录浏览器。

## 模型体验

无。该后端服务于 GUI 宿主的目录选择；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

- **Linux 依赖桌面工具**——Zenity 与 KDialog 均未安装时，`pick` 以包含解决建议的错误拒绝；它不会回退为手输路径提示（组合层面的回退是 browse 后端）。
- **Windows 没有机制级回退**——通过打包依赖 koffi 运行的子进程选择器是唯一原生层级，因此 COM 拒绝或对话框崩溃会直接上报失败。组合层面的回退仍是 browse 后端。
