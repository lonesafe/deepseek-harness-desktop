# @deepseek-ai/dsh-host-directory-picker-auto

[English](README.md) | 中文

[目录选择 seam](../directory-picker/README.zh.md) 的**自适应选择器**：一个只有 node 半侧的插件，在启动时一次性判定宿主处境，并把后端与 client 界面作为真实 Loader 条目挂进内存根树（绝不持久化到配置文件；根树的 `write()` 是 no-op）。判定为 browse 时，挂载 [`-browse`](../directory-picker-browse/README.zh.md) 与应用内浏览器。判定为 native 时，挂载 [`-native`](../directory-picker-native/README.zh.md) adaptive 后端，并把同一 browse 界面配置为回环页面使用 OS 选择器、远程页面使用应用内浏览。卸载选择器会移除两个条目并汇入它们的拆卸。

判定是一次纯函数的启动时采样（`resolveDirectoryPickerBackend`），已导出供复用。`native` 要求仅回环绑定、非 SSH 启动和可服务的显示会话——darwin／win32 上视为存在；linux 上要求 `DISPLAY`／`WAYLAND_DISPLAY`，外加 `PATH` 上有 zenity 或 kdialog；其他平台上不成立。任何含糊情形都判定为 `browse`。每次启动只采样一次，adaptive client 界面则按 `ctx.connection.isLoopback` 逐页决定使用 native 还是 browse。固定交互不是这里的配置字段；直接组合 `-browse` 即可强制应用内浏览。

## 模型体验

无。该选择器仅组合 GUI 宿主的目录选择；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **探测是从启动上下文推断操作者位置，而任何启动侧信号都无法证明这一点**——从 SSH 启动中脱离的 tmux 会话会丢失 `SSH_*` 标记；Aqua 会话之外的 Darwin 进程仍被算作有显示；在工作站本地启动、之后经 `ssh -L` 访问时，请求会从 `127.0.0.1` 到达，系统会判定 `native`，并把选择器弹在无人值守的工作站上。错误的 `native` 选择会退化为后端既有的可重试失败对话框，而对这类部署，直接组合 `-browse` 即选择安全的交互。
- **Linux 选择器探查只读 `PATH`**——以其他途径可用的 zenity／kdialog（shell 别名、未装在 PATH 上）仍判定为 `browse`；把任一二进制装到 `PATH` 上，下次启动即恢复 `native` 资格。
- **仅在启动时判定**——一次判定服务本次启动的所有客户端；按连接自适应（同一台服务器，本地浏览器用 native、远程浏览器用 browse）需要按客户端的能力对象以及 seam 有意删除的协议通告，等到出现同时服务两种形态的部署再做。
