# Agent Note: 浏览器 fixture 的心跳间隔

Status: implemented

[English](2026-09-19-browser-fixture-heartbeat.md) | 中文

## 问题

浏览器功能快照拒绝意外的连接重试，但其 Host 和 Chromium 进程与其他任务共享 CPU 和内存。一次本地诊断将已接受的 WebSocket 在升级约五秒后以异常关闭码 `1006` 断开，归因于网关的心跳终止回调。当时机器报告约 15 GB 物理内存正在使用、5 GB 压缩内存和 12 GB 交换空间。因此，在实测的宿主资源压力下，生产环境的 Pong 时间预算可能中断功能场景。

## 决策

[浏览器测试支架](../../../../apps/web/tests/scaffold.ts) 通过 fixture（测试前置数据）覆盖层将 `typert-gateway.websocketHeartbeatIntervalMs` 配置为 `10_000`。更长的间隔为资源争用时的 Pong 交付留出余量，同时保留现有的连续两次心跳未获响应后终止连接的策略。生产默认值、就绪期限、重试时序和控制台异常检查保持正常行为。

[心跳测试](../../../../packages/api/gateway/tests/stream-server.host.spec.ts) 负责 Ping/Pong 交付、心跳未获响应后的终止行为以及延迟 Pong 的处理；[网关配置测试](../../../../packages/api/gateway/tests/gateway-stream.host.spec.ts) 负责验证配置和计时器接线。[浏览器恢复场景](../../../../apps/web/tests/lifecycle-chrome.e2e.ts) 通过离线状态切换和显式关闭 socket 驱动恢复，因此其恢复断言不依赖 fixture 的心跳间隔。[持续恢复决策](../bug-fix/2026-09-05-continuous-client-recovery.zh.md) 仍负责产品的重试与就绪策略。

## 考虑过的替代方案

**增大生产心跳间隔。** 观测到的资源争用属于测试部署；改变所有部署的故障检测延迟需要独立的产品证据。

**忽略连接警告或重试失败场景。** 这两种选择都可能掩盖意外断连，并削弱无关功能的断言。

**禁用心跳。** 有限的间隔保留真实的 Ping/Pong 通信，并最终检测无响应的对端。

## 影响

浏览器功能覆盖可以容忍更长的调度延迟，也会更晚检测到确实无响应的对端。该 fixture 不验证生产心跳的检测延迟；直接传输测试仍承担这一职责，而浏览器场景仍会因意外恢复或输出变化而失败。
