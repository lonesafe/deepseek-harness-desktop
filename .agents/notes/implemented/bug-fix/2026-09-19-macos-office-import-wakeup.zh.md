# Agent Note: macOS Office 导入完成唤醒

Status: implemented

[English](2026-09-19-macos-office-import-wakeup.md) | 中文

## Problem

LibreOffice kit `0.0.1` 可能在 XLSX 导入完成后继续等待 macOS 应用事件。小型有效工作簿会耗尽转换期限，此时导入 worker 已空闲。[固定的 Core 修订版](../../../../packages/document/office-to-pdf/native/sources.json)在工作表导入完成时投递 `Application::EndYield()`，但 Quartz 可能消费该唤醒后再次无限等待。

## Decision

[Office provider](../../../../packages/document/office-to-pdf/README.zh.md) 携带 macOS 通用架构 helper，由已安装 kit 中校验和固定的 worker、三份修订版固定的 LibreOfficeKit 头文件和小型 Objective-C++ 兼容源码编译而成。消费出队的 Quartz `YieldWakeupEvent` 后，helper 将下一次匹配的无限事件读取改为非阻塞读取。其他事件、有限期限、模式、掩码和窥视操作保持原有语义。原始引擎、取消所有者和转换期限保持不变。

生成的私有入口保留 kit 的验证器、字体 worker、引擎解析和清理后的子进程环境，同时选择此 helper。其输入由精确的 kit 入口校验和固定。provider 发布 adapter、helper、源码材料、声明和构建清单。源码与 Desktop 构建编译 helper；npm 发布携带经过验证的 macOS 产物。普通 Windows 和 Linux 安装原样使用已发布的 kit 入口。ASAR 安装使用私有入口，macOS 采用兼容 helper，其他平台采用原始 helper：JavaScript 与字体 worker 导入仍使用归档逻辑 URL，原生路径则映射到解包资源。

这是[独立 kit 归属](../architecture/2026-09-14-independent-libreoffice-kit.zh.md)的有限例外。[平台选择决策](../architecture/2026-09-15-platform-office-engines.zh.md)仍是权威。经资格验证的 kit 版本在不使用两项本地适配的情况下通过相同 XLSX、事件序列和原生 ASAR 文件系统路径回归后，应一并移除兼容构建和私有入口。

## Alternatives considered

**增加期限或重试。** 已完成的导入器等待无关事件时没有有界的进展条件。增加时间不能修复唤醒。

**初始化 AppKit 或选择 SVP。** AppKit 初始化和真实应用循环回调仍可复现停滞。已安装的载荷即使指定 SVP 偏好仍选择 Quartz。

**注入动态库。** 注入能在原始 helper 中修复相同输入，确认成功并非重新编译所致，但硬化签名会引入动态库注入权限问题。静态链接保留现有签名权限，并避免继承加载器变量。

**周期性生成事件。** 合成输入和轮询会改变无关事件处理，并引入时序策略。兼容代码仅响应已消费的 Quartz 唤醒。

**仅发布工作区依赖补丁。** npm 消费者不会继承工作区打补丁后的依赖解析。私有入口随 provider 的发布资源一起分发。

## Consequences

在 kit 提供经资格验证的替代版本前，Harness 维护兼容源码和固定输入。源码漂移、helper 缺失和清单不兼容都会明确失败。运行时没有编译器、下载或引擎回退。签名前验证检查源码身份、两种 Mach-O 架构、执行权限和产物哈希。Desktop 签名及其最终运行时清单负责已签名字节。

确定性原生回归控制事件返回值，验证一次性非阻塞行为、有限期限和无关事件。移除兼容条件会使其失败。原生资格验证还通过 PDF 文本和页数检查六种 Office 格式及四工作表文件。浏览器和打包运行时资格验证仍不可缺少；编译两种架构不能替代在各目标上执行。
