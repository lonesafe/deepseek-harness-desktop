# Agent Note: 目录选择交互的自适应默认值

Status: implemented

[English](2026-07-29-directory-picker-adaptive-default.md) | 中文

## 问题

[目录选择 seam](../architecture/2026-07-28-directory-picker-capability-seam.zh.md) 把交互形态做成了 `cordis.yml` 的切换点，但随附的组合仍必须固定一个后端：处处用 `-browse` 意味着本地操作者永远得不到 OS 选择器，处处用 `-native` 则弄坏所有远程部署。正确的默认值取决于只有运行中的宿主才知道的事实——服务器绑定在哪里、进程是否经 SSH 启动、是否存在显示会话——因此没有哪一静态行对所有部署都正确。

## 决策

第三个同级包 **`dsh-host-directory-picker-auto`** 在启动时采样一次宿主事实，并把后端及其 client 界面作为 Loader 条目挂进内存根树。`native` 要求回环绑定、无 SSH 标记以及 native 后端能够驱动的显示会话；任何含糊情形都判定为 `browse`。native 后端公开一个稳定的 `adaptive` 能力，同时包含原生 `pick` 与浏览器 `list`／`createDirectory` 操作。选择器把它与配置为 `nativeOnLoopback` 的 browse client 界面配对：回环页面调用原生选择器，远程页面渲染应用内目录浏览器。判定为 browse 时则挂载 browse 后端与同一 client 界面，但不开启本地分支。disposer 会移除两个条目并汇入其拆卸，根树位置则阻止任何判定结果被持久化回 `cordis.yml`。

条目级挂载仍是承重机制，因为 `dsh-client-modules` 发现 client 界面的方式与发现配置行完全相同。逐页选择使用已经推导出的 `ctx.remote.$host.isLoopback` 事实，不在线上广播宿主能力。独立 native 界面与 adaptive 界面都通过 `dsh-client-ui-primitives` 中零 Cordis 的 `AsyncPickerFlow` 原语驱动异步字符串选择；各功能包仍持有自己的线上调用与组合。桌面 tunnel 继续阻止远程页面调用 `directoryPicker/pick`，远程选择只使用被转发的 `directoryPicker/list` 与 `directoryPicker/createDirectory` 方法。

## 曾考虑的替代方案

- **在 `AppCLIEntry` 里做启动胶水判定**（随附两行并带静态 `disabled`，由 `--directory-picker=auto|native|browse` 标志修补 `disabled`）。可行——`PatchOptions` 能修补元数据，模块扫描也会跳过禁用行——但把决策留成应用私有，此后每个组合都要重新实现；选择器插件让任何 `cordis.yml` 都获得同样的一行自适应。只有当某个部署需要不改自己的 yml 就*强制*指定后端时，才重新引入该标志。
- **由某个功能插件导入 native 流程，并在 `directory-picker-unavailable` 后回退。**否决：client bundle 纯净门禁禁止跨功能运行时导入，而且按调用探测会让 browse 宿主每次打开都付出一次注定失败的 RPC。adaptive browse 界面在启动操作前按页面 authority 分支，仅从静态 UI 层共享中性的生命周期原语。
- **复活 wire 广播**，让两套 client 流程都挂载并按宿主的 kind 分支。否决：推翻 seam Agent Note 的那次删除，却服务不了任何选择器尚未服务的消费方，还与 `single` 目录流洞相冲突。
- **同时挂载两套 client 流程，再按线上能力广播选择。**否决：现有 `single` 目录流 slot 禁止竞争占用者，而且页面已经知道自身是否为回环。一套 adaptive browse 界面即可选择可达分支，无需增加协议字段或复制对话框。
- **把 native 请求生命周期复制进 adaptive 界面。**否决：两份代码的 open 上升沿、最新回调、StrictMode 与卸载后丢弃结算行为完全相同，并触发重复门禁。把这段无 Cordis 生命周期移入 `dsh-client-ui-primitives`，既保留功能包隔离，也无需压制 clone。

## 后果

- 随附的桌面 GUI 在同一进程中为本地页面使用 OS 选择器、为远程页面使用应用内浏览器。SSH、无头、不支持的平台或没有选择器二进制的 Linux 启动对所有页面都使用应用内浏览器。
- 选择器按运行时字符串（已导出的 `BACKEND_PACKAGES`）挂载后端，yml 行扫描看不到这一点；因此 `verify-cordis-config` 要求每个挂载 `-auto` 的组合把两个后端都声明为依赖，使无密钥的 Linux CI（它永远只会判定出 `browse`）无法掩盖被丢掉的 `-native` 依赖。随附树的 web e2e／快照通道（`apps/web/tests/scaffold.ts`）以 disable+insert 补丁固定 `-browse`——其预期输出取决于具体交互，绝不能依赖运行该套件的宿主。
- 每次启动只判定一次后端，维持 seam 的能力稳定性约定；每个已连接页面在不改变该 Host 能力的前提下选择可达交互。
- 同时挂载选择器**和**某个后端行会明确报错（重复的 `directoryPicker` 服务；`single` 洞中的重复流程）。
- host 类型检查聚合现在引用两个后端项目（仅声明，node 入口不携带 client 合并），使选择器的 REAL-composition 测试能挂载它们——与 client 聚合对 `webserver` 的引用互为镜像。
