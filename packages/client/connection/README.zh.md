# @deepseek-ai/dsh-client-connection

[English](README.md) | 中文

协议消费层：客户端插件的 apply 会挂载 `ctx.connection`（共享 API 客户端 + 当前页面的 loopback 状态 + 可观察且按 generation 生效的 `hostDescription` + 单消费方流循环启动器）；导出表层携带协议约定类型、`AbstractApiClient` 抽象，以及循环的 sink／配置类型。每次就绪握手成功后，都会在 `onConnected` 之前发布完整的 `host.describe` 值；generation 失效或显式 stop 会清空它，因此原生能力消费者不会保留已经断线的判断。直连浏览器载体以 HTTP POST 发送 unary／respond；可信的远程官网壳也可改用一条复用的 `/api/rpc` WebSocket 承载这些操作。两种模式都会为 `events.mux` 与 `events.host` 各开一条只下行的 WebSocket，进程内载体也满足同一双流抽象。Host half 持有唯一 `/api` route 及其 Fetch bridge；已注册的 Typert interceptor 会先认领自己的 Remote endpoint，未认领请求再回退 API Proxy。Loopback hostname 判定逻辑留在包内部：`/api` Host fence 与 WebSocket upgrade 会直接使用它，其他客户端插件则消费派生的 `ctx.connection.isLoopback` 状态。node 半侧的 `/api` 路由让特权方法集（`host.pickDirectory`、`host.openPath`，以及整个配置面——`settings.describe`/`openDocument`/`update`/`replace`/`mutate` 与 `credentials.describe`/`set`/`unset`；读取与原生操作也在内，因为 describe 会返回已暴露的配置、打开操作会作用于 Host 桌面，而探测任意引用会报出某条凭据来自何处——以及 agent（智能体） preset 的创作面 `agentPreset.read`/`copy`/`openDocument`/`remove`，因为组装指明了一个会话所运行的插件，读取它是侦察，而 copy/remove/openDocument 管理名单并驱动宿主桌面（创作只有复制一种写入，因此这些方法都不接收组装文本或路径）；`agentPreset.list` 与 `agentPreset.select` 不在其中——名单只携带 id 与信任级别，而选择一个 preset 并不比 `session.create` 自带的 `agentPreset` 多给任何能力，何况默认 preset 本就带着 bash）以空信任表通过信任 fence，从而钉在回环——已声明的 `trustedHosts` authority 可达其余全部方法，但即使组合 Web 载体已经认证局域网用户，这些方法仍只限回环本机。导出的 `loopbackOnlyMethods()` 注册表是与桌面远程隧道测试共享的审计输入；测试会证明其中每项不是被拦截，就是被明确投影成只读。平台载体与 ConnectionController 循环属于包内部；apply 负责选择并驱动它们。物理边界见 [WebSocket 下行载体](../../../.agents/notes/implemented/architecture/2026-08-04-websocket-downlink-carrier.md)与[远程 WebSocket RPC 载体](../../../.agents/notes/implemented/architecture/2026-08-16-remote-websocket-rpc-carrier.md) Agent Note。

## /api 浏览器信任栅栏

node 半侧在桥接或 upgrade 前守卫 `/api` 下的每个入口（`src/api-request-trust.ts`）。每个请求——无论是否带浏览器标记——`Host` 都必须是回环地址权威，或与某个 `trustedHosts` 条目匹配：带端口的 `host:port` 条目精确匹配，不带端口的条目匹配任意端口，两侧均经 WHATWG 归一化后比较（DNS rebinding 防御）。刻意不为无浏览器标记的 HTTP 请求开捷径：明文 HTTP 下浏览器的图片与导航读取既不带 `Origin` 也不带 Fetch-Metadata，因此无标记请求仍可能是被重绑页面发起的、响应可被读走的读取，而 Host 是重绑唯一伪造不了的请求头；WebSocket 浏览器握手会带 `Origin` 并通过同一道比较。非浏览器客户端经由回环地址、部署推导的 LAN IP 字面量或已声明的权威通过同一道栅栏。当标记存在时，如附带 `Origin`，则它必须与 Host 权威完全一致；显式的 `sec-fetch-site: cross-site` 标记一律拒绝。不是纯的、规范形 `host[:port]` 权威的 `trustedHosts` 条目——即 WHATWG 解析读回后与原文不完全一致的——会让插件加载明确报错：否则解析会悄悄授权 `harness.internal/path` 这类笔误里的 hostname，或把悬空冒号、补零端口放大成任意端口授权。HTTP 失败在任何 RPC 分发之前以纯 403 应答，upgrade 失败在启动任何事件流前拒绝握手。非回环组合必须显式信任其服务权威：Web 运行时从全接口服务器配置推导 LAN IP 字面量，cordis.yml 中的 `trustedHosts` 与 CLI（命令行界面）的 `--trusted-host` flag 则声明具名权威。`dsh web --host 0.0.0.0` 只有在提供 access token 时才会被接受；webserver 会先认证所有非回环 HTTP 与 upgrade 请求，再进入这道栅栏。该栅栏继续只持有可达性与 DNS 重绑定策略，并不是认证所有者。决策记录：[api 浏览器信任边界 Agent Note](../../../.agents/notes/implemented/architecture/2026-07-28-api-browser-trust-boundary.md)。

## `/api` WebSocket 下行

`/api/events.mux` 与 `/api/events.host` 各接受一条 WebSocket upgrade，并只向浏览器发送对应的 `ServerRequest` 文本消息；客户端不会在这些 socket 上发送业务数据。任一 socket 结束都会使当前 connection generation 失败并重建两条流，连接就绪仍要求两条 socket 均已打开且 `host.describe` unary 调用成功。Host teardown 会终止两条 socket、中止各自的 source，并等待 source 清理完成后再返回。普通网络 GET 这些路径会返回 426，不保留 SSE（Server-Sent Events）回退；`toFetchHandler` 的 SSE 编解码只服务进程内同构载体。浏览器侧 RPC 标识使用 `crypto.getRandomValues()`，而不依赖只在安全上下文中提供的 `crypto.randomUUID()`，因此明文 HTTP 局域网表层仍能使用随机性不打折的 UUID v4 关联标识。

## 远程官网 RPC WebSocket

远程官网会在其提供的壳中插入精确的 `window.__DSH_REMOTE_RPC__ = "/api/rpc"` 标记。`WebApiClient` 只接受这一个内置路径，并通过一条随页面存续的 WebSocket 承载 unary 与 respond JSON 信封；标记缺失或不同的桌面直连页和局域网页仍使用 HTTP。带标记的页面在 socket 失败后不会静默回退到 HTTP，因此认证、取消与传输失败仍然可见，不会在请求中途改变载体语义。

文本控制消息负责开始、结束或取消一项传输请求，以及开始、结束或报告其响应失败。二进制消息在每个正文分片前放置传输 id 的长度和 UTF-8 传输 id，让并发逻辑 RPC 可以交错传输，且不会与信封中独立的 `rpcId` 混淆。请求上限为 24 MiB，响应上限为 128 MiB，分片大小为 512 KiB；调用方 abort 会发送 `rpc_cancel`，socket 断开会拒绝全部在途操作，畸形帧会关闭共享 socket。基类仍持有信封 mint、schema 校验、rpcId 回显校验与时限：普通 unary 调用使用 30 秒，history 使用 150 秒，使官网两分钟的服务端时限可以先返回明确结果。

## 模型体验

无。协议消费层只在浏览器与主机之间搬运已经组合好的消息；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

- **History 会恢复未附加的会话**：打开 history 可能创建宿主侧 agent，并增加首次打开的延迟；没有仅从持久化读取的路径。
- **`/api` 桥把每个请求体整体缓冲在内存里**：`maxRequestBodyBytes`（默认 160 MiB，按默认 100 MiB 图片总量上限经 base64 膨胀加信封余量得出）因此同时是单请求的驻留内存上界；要降低它而不缩小图片限额，需要流式请求体路径。
