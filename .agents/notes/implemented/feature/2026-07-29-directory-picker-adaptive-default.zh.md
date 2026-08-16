# Agent Note: 目录选择交互的自适应默认值

Status: implemented

[English](2026-07-29-directory-picker-adaptive-default.md) | 中文

## 问题

[目录选择 seam](../architecture/2026-07-28-directory-picker-capability-seam.md) 把交互形态做成了 `cordis.yml` 的切换点，但随附的组合仍必须固定一个后端：处处用 `-browse` 意味着本地操作者永远得不到 OS 选择器，处处用 `-native` 则弄坏所有远程部署。正确的默认值取决于只有运行中的宿主才知道的事实——服务器绑定在哪里、进程是否经 SSH 启动、是否存在显示会话——因此没有哪一静态行对所有部署都正确。

## 决策

第三个同级包 **`dsh-host-directory-picker-auto`** 在启动时采样一次宿主事实，并把后端与 client 界面挂为内存根树中的 Loader 条目。`native` 要求回环绑定、无 SSH 标记和 native 后端能驱动的显示会话；任何含糊情形都判定为 `browse`。native 后端暴露一个稳定的 `adaptive` 能力，同时包含原生 `pick` 与浏览器 `list`/`createDirectory` 操作。选择器将其与配置为 `nativeOnLoopback` 的 browse client 界面配对：回环页面调用原生选择器，远程页面渲染应用内目录浏览器。browse 判定则挂载 browse 后端与不含本地分支的同一 client 界面。disposer 移除两个条目并汇入它们的拆卸；根树定位保证判定出的行不会持久化到 `cordis.yml`。

条目级挂载仍是承重机制，因为 `dsh-client-modules` 像发现配置行一样从 Loader 条目发现 client 界面。逐页选择使用已派生的 `ctx.connection.isLoopback` 事实，不在 wire 上广播宿主能力。桌面隧道继续拦截 `host.pickDirectory`；远程选择只使用可转发的 `host.listDirectory` 与 `host.createDirectory`。

## 曾考虑的替代方案

- **在 `AppCLIEntry` 里做启动胶水判定**（随附两行并带静态 `disabled`，由 `--directory-picker=auto|native|browse` 标志修补 `disabled`）。可行——`PatchOptions` 能修补元数据，模块扫描也会跳过禁用行——但把决策留成应用私有，此后每个组合都要重新实现；选择器插件让任何 `cordis.yml` 都获得同样的一行自适应。只有当某个部署需要不改自己的 yml 就*强制*指定后端时，才重新引入该标志。
- **合并成一个按调用分支的插件**（client 先试 `pick`，收到 `directory-picker-unavailable` 再回退到浏览对话框）。否决：client 得把两套流程装进同一个 bundle——bundle 纯净门禁禁止跨插件的值导入，jscpd 禁止复制对话框——而且按调用探测让 browse 宿主每次打开都付出一次注定失败的 RPC。
- **复活 wire 广播**，让两套 client 流程都挂载并按宿主的 kind 分支。否决：推翻 seam Agent Note 的那次删除，却服务不了任何选择器尚未服务的消费方，还与 `single` 目录流洞相冲突。
- **同时挂载两套 client 流程，再按 wire 能力广播选择。**否决：既有 `single` directory-flow slot 不允许竞争占用者，且页面已经知道自己是否回环访问。一套 adaptive browse 界面即可选择可达分支，无需新增协议字段或复制对话框。

## 后果

- 随附的桌面 GUI 在同一进程中，本地使用 OS 选择器，远程使用应用内浏览器。SSH、无头、不支持的平台，或缺少选择器的 Linux 启动对所有页面都使用应用内浏览器。
- 选择器按运行时字符串（已导出的 `BACKEND_PACKAGES`）挂载后端，yml 行扫描看不到这一点；因此 `verify-cordis-config` 要求每个挂载 `-auto` 的组合把两个后端都声明为依赖，使无密钥的 Linux CI（它永远只会判定出 `browse`）无法掩盖被丢掉的 `-native` 依赖。随附树的 web e2e／快照通道（`apps/web/tests/scaffold.ts`）以 disable+insert 补丁固定 `-browse`——其预期输出取决于具体交互，绝不能依赖运行该套件的宿主。
- 每次启动只判定一次后端，维持 seam 的能力稳定性约定；每个已连接页面在不改变该 Host 能力的前提下选择可达交互。
- 同时挂载选择器**和**某个后端行会明确报错（重复的 `directoryPicker` 服务；`single` 洞中的重复流程）。
- host 类型检查聚合现在引用两个后端项目（仅声明，node 入口不携带 client 合并），使选择器的 REAL-composition 测试能挂载它们——与 client 聚合对 `webserver` 的引用互为镜像。
