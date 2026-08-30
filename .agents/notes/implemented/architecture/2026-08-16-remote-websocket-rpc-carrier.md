# Agent Note: Multiplexed WebSocket RPC carrier for remote access

Status: implemented

English | [中文](2026-08-16-remote-websocket-rpc-carrier.zh.md)

## Problem

The central remote shell originally sent each unary operation and server-request response as a separate HTTP request through the portal. A history load could spend long enough reading, projecting, serializing, and relaying a cold session for a mobile browser to abort its request before the portal's bounded device operation returned. The HTTP relay also reassembled every chunked desktop response before writing it to the browser. Moving the browser directly onto the desktop's generic WebSocket forwarding path would avoid that request lifecycle, but it would bypass the desktop tunnel's HTTP-level privileged-method refusal and read-only configuration projection.

## Decision

The portal inserts the exact `window.__DSH_REMOTE_RPC__ = "/api/rpc"` marker into the central shell. The Connection client accepts that marker only when the shell has not installed the newer `window.__DSH_TRANSPORT__` hooks, adapts one page-lifetime `WebSocketRpcTransport` to the generic RPC fetch seat, and passes it to `createWebConnectionRpc`; direct desktop, LAN, fixture, worker, and in-process clients retain their selected carriers. The Connection RPC layer continues to mint and observe envelopes, apply caller cancellation and deadlines, validate response schemas, and require the logical `rpcId` echo. Ordinary unary calls retain the 30-second deadline, while `session/history` and `subagent/history` use 150 seconds so the portal's two-minute request deadline can return an explicit failure before the browser aborts.

The browser and portal multiplex concurrent operations with an independent transport id. Text frames start and finish requests, start and finish responses, report transport failures, or cancel one operation; binary frames begin with a two-byte big-endian transport-id length, the UTF-8 transport id, and one body chunk. Request and response ceilings remain 24 MiB and 128 MiB, and each body message is at most 512 KiB. The portal streams validated desktop start/chunk/end response frames to the browser without rebuilding the complete body; the browser assembles only its own response before handing a fetch-compatible `Response` back to the unchanged logical parser. Both public WebSocket legs negotiate standard compression, so repetitive JSON history bytes are compressed in transit even though logical size checks and the browser parser continue to use decoded bytes.

The portal authenticates the relay session, compares the browser Origin with the relay authority, confirms current device ownership and online state, and only then upgrades `/api/rpc`. It translates each complete browser JSON request into the existing desktop-tunnel `http_request` frame rather than opening a local RPC WebSocket. The desktop normalizes `/api/<namespace>/<method>` to the generated slash-tagged Client Remote method, refuses the explicit loopback-only table, forwards other methods, removes sensitive request headers, fixes the target to the embedded loopback Host, and projects successful `settings/describe` and `credentials/describe` `server-response` values as read-only. These controls preserve the policy described by the [remote relay decision](../feature/2026-08-15-account-device-remote-relay.md). A browser cancel releases the portal wait; socket loss cancels every in-flight portal operation. The marked remote client never silently falls back to HTTP, while the existing HTTP relay stays available for an older exported shell during a compatible rollout.

The two application event streams remain independent downlink-only WebSockets under the [browser downlink decision](../../archived/architecture/2026-08-04-websocket-downlink-carrier.md). A remote page therefore owns three sockets: one multiplexed client-initiated RPC carrier plus the mux and host downlinks. Their logical schemas, readiness behavior, and lack of cross-stream ordering are unchanged.

## Verification

Connection client tests pin generic transport-hook precedence, exact legacy-marker selection, secure URL construction, one-socket reuse, binary request carriage, response correlation, fetch exclusion, and cancellation frames while retaining direct-page HTTP coverage. RPC tests pin the longer bounded history deadline. Portal protocol tests pin request validation, recursive-path refusal, binary framing, desktop request translation, ordered chunk streaming, response-header filtering, compression negotiation, and malformed-frame closure; desktop tunnel tests pin the generated slash-method policy, `server-response` read-only projection, callback streaming without response reassembly, and consumer cancellation, while the Go race detector covers concurrent reader, writer, and cancellation state. The assembled browser lane and a production relay smoke test cover the exported marker, authenticated upgrade, event downlinks, history loading, and mobile interaction together.

## Alternatives considered

**Forward `/api/rpc` as a generic WebSocket to the desktop.** The desktop's generic socket forwarding does not inspect logical RPC messages, so this route would skip the HTTP tunnel's privileged-method block and redacted read-only projections. Translating into the existing `http_request` frame preserves one policy owner.

**Use one WebSocket per RPC.** Repeating the upgrade and authentication handshake would retain most per-request connection cost and would not allow concurrent responses to share backpressure. A transport id lets one authenticated socket multiplex bounded work.

**Move direct desktop and LAN pages onto the same uplink immediately.** Those paths already have a short same-origin HTTP hop and a working Host/Origin trust fence. Portal-only marker selection confines the new carrier to the latency and intermediary boundary that needs it while retaining the direct path's deployed semantics.

**Fall back to HTTP when the remote socket fails.** Mid-page fallback would split cancellation and authentication behavior and could replay a side-effectful request whose outcome is unknown. The shared socket fails visibly and reconnects only for a later operation.

## Consequences

Remote history and other business RPCs no longer depend on a mobile browser holding one HTTP request open, and large desktop responses cross the portal without full server-side reassembly. The logical protocol and desktop security policy remain unchanged, and older shells can continue through the bounded HTTP compatibility route during rollout. The cost is a third page-lifetime socket, a compact framing protocol and per-id state on both browser and portal, and browser-side response assembly up to the existing 128 MiB ceiling. Request JSON still resides in portal memory up to 24 MiB because the installed desktop tunnel accepts one complete `http_request`; end-to-end request streaming requires a future desktop tunnel version rather than a portal-only change.
