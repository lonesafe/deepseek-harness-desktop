---
description: "将已发布的 V3 Session 恢复为 V4，同时保留审批决定、事件值和继承坐标。"
kind: "package-library"
---

# @deepseek-ai/dsh-session-format-v3-to-v4

[English](README.md) | 中文

## 概述

将已发布的 V3 Session 恢复为 V4，且不改变获准事件的值。此迁移边保留记忆式审批决定、消息标识、事件顺序、引用和继承切点，仅递增头部版本。静态 Session 格式 catalog 使用此库；本包不执行文件 I/O。

## 目录

- [使用本包](#use-this-package)
- [V3 到 V4 规范](#v3-to-v4-specification)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

使用 [catalog](../session-format-catalog/README.zh.md) 完成恢复。[公共入口](src/index.ts) 的直接导入用于 catalog 组装与测试；此库没有 Cordis 挂载配置。

仅处理头部的操作会校验 V3 元数据并返回 V4 元数据，不读取事件：

```text
const targetHeader = sessionFormatV3ToV4.migrateHeader(sourceHeader)
```

完整恢复会解码行、传入全新的迁移阶段、调用 `finish()`，并校验目标产物。部分输出不能确立恢复成功。[格式协议](../session-format/README.zh.md) 负责调度与错误处理；[JSONL 持久化](../session-persistence-jsonl/README.zh.md) 负责发布不可变的后继代文件。

-----

<a id="v3-to-v4-specification"></a>
## V3 到 V4 规范

逻辑头部仅将 `version: 3` 改为 `version: 4`。每个获准事件均保留其类型、载荷、时间戳、序号、可选封套字段与位置。这包括 `approval/asked.data.alwaysAllowKey`、`approval/decided.data.outcome: 'allowed-always'`、系统消息、替换端点、已捕获的格式版本及不透明嵌套值。此迁移边既不插入事件，也不重命名预设。

源序号保持从零开始连续。最后一个带有 `data.inherited: true` 的 `session/end-seed` 决定继承切点，且不包含该标记。若提供切点，则必须一致。已播种输入必须包含标记；未播种输入不得包含标记。阶段在前序迁移结束后推导未知切点，并展开紧凑 run 而不保留中间数组。

V3 物理解码与 V4 事件编码复用已发布的 V3 codec。目标恢复保留 V3 结构及关系校验，包括受保护的系统头消息与必需事件准入。未知必需事件会被拒绝，除非已安装事件集合识别该类型；未知可忽略事件保留原值。恒等转换不重新解释不透明引用。

投递确认保留已记录的代号与 `throughSeq`。已声称 V4 的 V3 源标记会被拒绝，因为迁移不得激活未来代的确认。指向其他 Session 的源 V3 标记仅在含父级元数据的继承前缀内获准。原生 V4 恢复对 V4 标记执行同样的归属校验；历史代仍按历史代处理。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节——点击展开</summary>

[Codec](src/codec.ts) 围绕冻结的 V3 codec 仅转换头部版本。[阶段](src/migration.ts) 负责各产物的序号、种子和投递校验。[恢复器](src/validation.ts) 使用私有的代号调整视图校验投递关系，并原样返回原始产物。历史版本字面量独立于已安装写入器常量。

本包不发布运行时不变量伴随模块：纯 codec 与各产物独有的阶段不存在可供对照的、独立变化的运行时观测值。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [已发布的 V2 到 V3 语义](../session-format-v2-to-v3/README.zh.md)
- [格式版本与发布状态](../../../docs/session-format-status.zh.md)
- [持久化类型变更确认](../../../docs/cookbook/reviewing-persistence-type-changes.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 恢复的 Session 历史

#### 模型看到什么

迁移保留所有获准的已记录消息和请求值。`approval/asked` 与 `approval/decided` 审计事件仍仅用于日志。

#### Token 影响

此迁移边不添加模型可见文本，也不改变任何已记录消息内容。

#### KV 缓存影响

历史请求内容与配置保持不变。提供方缓存可用性不属于本包职责。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **不迁移文件**——此库从不重写已提交的代文件。持久化层负责发布后继代；现有 V4 产物不会再次运行此入向迁移边。
- **已发布的准入规则保持固定**——此迁移边不能修复不受支持的更早代文件，也不能重新解释其载荷。更早的迁移保留各自的拒绝策略。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
