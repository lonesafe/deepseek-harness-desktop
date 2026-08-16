# Agent Note: 远程访问的复用 WebSocket RPC 载体

Status: implemented

[English](2026-08-16-remote-websocket-rpc-carrier.md) | 中文

## Problem

中央远程壳最初把每项 unary 操作和 server request 响应都作为独立 HTTP 请求经过官网。加载历史时，读取、投影、序列化并中转冷会话可能耗时较长，移动浏览器会在官网有界设备操作返回前先 abort 请求。HTTP 中转还会先重组桌面端的全部响应分片，再写回浏览器。让浏览器直接接入桌面端的通用 WebSocket 转发路径虽能避开该请求生命周期，却会绕过桌面隧道在 HTTP 层执行的特权方法拒绝和只读配置投影。

## Decision

官网会在中央壳中插入精确的 `window.__DSH_REMOTE_RPC__ = "/api/rpc"` 标记。`WebApiClient` 只接受这一个内置值，并以一条随页面存续的 WebSocket 覆写 `AbstractApiClient.postJsonTransport`；桌面直连、局域网、fixture（测试前置数据）和进程内客户端没有该标记，继续保留各自现有载体。基类继续持有信封 mint 与观测、调用方取消与时限、响应 schema 校验，以及逻辑 `rpcId` 回显要求。普通 unary 调用仍使用 30 秒时限，`session.history` 和 `subagent.history` 则使用 150 秒，使官网两分钟的请求时限可以在浏览器 abort 前先返回明确失败。

浏览器与官网使用独立的传输 id 复用并发操作。文本帧负责开始和结束请求、开始和结束响应、报告传输失败，或取消一项操作；二进制帧由两字节大端序传输 id 长度、UTF-8 传输 id 与一个正文分片组成。请求与响应上限仍为 24 MiB 和 128 MiB，每条正文消息最大 512 KiB。官网把经过校验的桌面 start/chunk/end 响应帧流式传给浏览器，不重建完整正文；浏览器只重组自己的响应，再把兼容 fetch 的 `Response` 交回未改动的逻辑解析器。两段公网 WebSocket 都会协商标准压缩，因此重复度很高的 JSON 历史在传输时会被压缩，而逻辑大小限制和浏览器解析仍按解压后的字节计算。

官网先认证中转 session、把浏览器 Origin 与中转 authority 比较，并确认当前设备归属和在线状态，然后才 upgrade `/api/rpc`。它会把每项完整的浏览器 JSON 请求转换为现有桌面隧道 `http_request` 帧，而不是打开本地 RPC WebSocket。因此桌面端继续作为策略真源，负责规范化 RPC 路径检查、特权方法拒绝、敏感 header 移除、固定回环目标，以及[远程中转决策](../feature/2026-08-15-account-device-remote-relay.md)所述的只读设置与凭据投影。浏览器取消会释放官网等待，socket 断开会取消全部在途官网操作。带标记的远程客户端不会静默回退到 HTTP；兼容发布期间，现有 HTTP 中转仍可供较旧的导出壳使用。

两条业务事件流继续遵守[浏览器下行决策](2026-08-04-websocket-downlink-carrier.md)，保持彼此独立且只下行。一个远程页面因此持有三条 socket：一条复用的客户端发起 RPC 载体，加上 mux 与 host 下行。它们的逻辑 schema、就绪行为和跨流无序属性均不改变。

## Verification

客户端测试固定精确标记选择、安全 URL 构造、单 socket 复用、二进制请求承载、响应关联、排除 fetch 与取消帧，同时保留直连页面 HTTP 覆盖。API 客户端测试固定较长但有界的 history 时限。官网协议测试固定请求校验、递归路径拒绝、二进制分帧、桌面请求转换、有序分片流传、响应 header 过滤、压缩协商和畸形帧关闭；隧道测试固定不重组响应的回调流与消费方取消，Go 竞态检测覆盖并发读写与取消状态。组装浏览器车道与生产中转冒烟测试会一并覆盖导出标记、经过认证的 upgrade、事件下行、历史加载和移动端交互。

## Alternatives considered

**把 `/api/rpc` 作为通用 WebSocket 转发给桌面端。** 桌面端的通用 socket 转发不会检查逻辑 RPC 消息，因此会跳过 HTTP 隧道的特权方法封锁与脱敏只读投影。转换为现有 `http_request` 帧可保留唯一策略所有者。

**每项 RPC 使用一条 WebSocket。** 重复 upgrade 与认证握手会保留大部分逐请求连接成本，也无法让并发响应共享背压。传输 id 可让一条已认证 socket 复用有界工作。

**立即让桌面直连页和局域网页也使用同一上行。** 这些路径已有很短的同源 HTTP 跳转与可用的 Host／Origin 信任栅栏。仅由官网标记选择，可把新载体限制在真正需要它的延迟与中间层边界，同时保留直连路径已部署的语义。

**远程 socket 失败时回退到 HTTP。** 页面中途回退会分叉取消与认证行为，还可能重放结果未知且带副作用的请求。共享 socket 会显式失败，只为后续操作重新连接。

## Consequences

远程 history 与其它业务 RPC 不再依赖移动浏览器一直维持某一条 HTTP 请求，大型桌面响应经过官网时也不再需要服务端完整重组。逻辑协议与桌面安全策略不变，发布期间较旧壳仍可继续走有界 HTTP 兼容入口。代价是新增第三条随页面存续的 socket、浏览器与官网两侧的一套紧凑分帧协议及逐 id 状态，以及浏览器侧在现有 128 MiB 上限内重组响应。请求 JSON 仍会以最多 24 MiB 驻留官网内存，因为已安装桌面隧道接收一项完整的 `http_request`；端到端请求流传需要未来的桌面隧道版本，不能只改官网。
