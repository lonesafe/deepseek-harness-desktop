# Agent Note: Browser fixture heartbeat cadence

Status: implemented

English | [中文](2026-09-19-browser-fixture-heartbeat.zh.md)

## Problem

Browser feature snapshots reject unexpected connection retries, but their Host and Chromium processes share CPU and memory with other work. A local diagnostic attributed an accepted WebSocket's abnormal close code `1006` to the Gateway heartbeat termination callback about five seconds after upgrade. The machine reported roughly 15 GB of physical memory in use, 5 GB compressed, and 12 GB of swap. The production Pong budget can therefore interrupt a functional scenario under measured host pressure.

## Decision

The [browser scaffold](../../../../apps/web/tests/scaffold.ts) configures `typert-gateway.websocketHeartbeatIntervalMs` to `10_000` through its fixture overlay. The longer interval gives Pong delivery headroom under contention while retaining the existing two-missed-heartbeat termination policy. Production defaults, readiness deadlines, retry timing, and console tripwires retain their normal behavior.

The [heartbeat tests](../../../../packages/api/gateway/tests/stream-server.host.spec.ts) own Ping/Pong delivery, missed-heartbeat termination, and delayed-Pong handling; [Gateway configuration tests](../../../../packages/api/gateway/tests/gateway-stream.host.spec.ts) own validation and timer wiring. The [browser recovery scenario](../../../../apps/web/tests/lifecycle-chrome.e2e.ts) drives offline transitions and explicit socket closure, so its recovery assertions do not depend on the fixture heartbeat interval. The [continuous recovery decision](../bug-fix/2026-09-05-continuous-client-recovery.md) remains the owner of product retry and readiness policy.

## Alternatives considered

**Increase the production heartbeat interval.** The observed contention belongs to the test deployment; changing every deployment's failure-detection latency requires separate product evidence.

**Ignore connection warnings or retry failed scenarios.** Either choice can conceal unexpected disconnections and weaken unrelated feature assertions.

**Disable the heartbeat.** A finite interval preserves real Ping/Pong traffic and eventual detection of an unresponsive peer.

## Consequences

Functional browser coverage tolerates longer scheduling delays and detects genuinely unresponsive peers later. The fixture does not qualify the production heartbeat's detection latency. Direct transport tests retain that responsibility, while browser scenarios still fail on unexpected recovery or altered output.
