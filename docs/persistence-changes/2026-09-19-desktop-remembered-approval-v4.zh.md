---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-19-desktop-remembered-approval-v4

[English](2026-09-19-desktop-remembered-approval-v4.md) | 中文

## 概述

将桌面分支的记忆审批审计纳入持久化类型记录，并将 Session 写入格式推进到 V4。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-19-desktop-remembered-approval-v4
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "1a3440e3577382704d42a6263aa463504eb74c566734a55e9503a63efcd02445"
    decision: version-bump
  - root: "event:approval/asked"
    previous: "2026-09-11-initial"
    after: "3de4c78f5e8160145c72557799ff01437fcca26415f5f1203bac4aaf536bfb31"
    decision: version-bump
  - root: "event:approval/decided"
    previous: "2026-09-11-initial"
    after: "3540ba912cce0277667259834443a3109f6111e96227a5ba15e2655af1552f3a"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

桌面分支已在 V3 中写入 alwaysAllowKey 和 allowed-always 结果；普通上游记录可以缺少可选的询问键。在已记录的封闭结果联合中增加字面值需要新的头部版本，因此 V4 使用相邻的 V3 到 V4 迁移。迁移保留事件值、身份、序列引用与继承切点，绝不覆盖历史代文件。旧读取器会拒绝 V4 头部，避免在其声明支持的格式下收到未知结果。V3 交付确认仍属于历史坐标，源标记不能声称属于目标代际。已接受的上游类型记录与已发布的编解码器保持不变。

<a id="verification"></a>
## 验证

新迁移与冻结 V3 测试目录的 317 项定向测试通过；新迁移的 15 项用例覆盖全部源码语句、分支、函数与行。当前目录及生成器的 34 项测试通过。已保留前代样本哈希，用于集成回放校验。

<a id="dev-note"></a>
## 开发备注

无。
