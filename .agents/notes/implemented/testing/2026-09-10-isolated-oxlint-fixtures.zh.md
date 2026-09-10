# Agent Note: 将 Oxlint 夹具与工作区源码发现隔离

Status: implemented

[English](2026-09-10-isolated-oxlint-fixtures.md) | 中文

## Problem

写入真实源码目录的 Oxlint 探针可能先被并发 TypeScript 程序纳入，再被测试清理删除。一次实际类型检查因已删除的 Session 探针报出 TS6053。随机文件名能防止测试之间重名，却无法将探针与源码发现或编译输出隔离。[覆盖率构建顺序](../process/2026-08-18-in-job-partitioned-coverage.zh.md)只覆盖特定执行图；脚本夹具也必须容忍独立运行的源码检查。

## Decision

[Oxlint 测试](../../../../scripts/oxlint-contract.spec.ts)为每个写入或修复文件的用例拥有独立的 `mkdtemp` 项目。它复制真实 lint 配置和相关 TypeScript 配置，保留文件布局、包含规则、排除规则以及本地项目归属。未复制的项目引用、源码别名和环境类型根目录解析到仓库，只作为只读依赖。真实 CLI 和仓库 runner 以独立项目为工作目录执行。

Session 源码复制到 `packages/core/session/src`，因此弃用方法诊断和仅供测试使用的 `allow.from=file` 例外会在真实相对路径上检查实际声明。合成声明或指向仓库的符号链接都无法保留这项证据。夹具仅链接 `node_modules`；分配目录后立即登记清理，并在同步子进程返回后使用共享的 junction 安全删除工具。

## Alternatives considered

**串行运行源码检查和脚本测试。** 这会让独立门禁依赖夹具内部实现，而分别启动的进程仍会暴露于竞态。

**从编译器和文档扫描中排除探针文件名。** 生产发现规则会增加测试专用例外，其他扫描器仍可能看到临时文件。

**用合成版本替换 lint 规则或 Session 声明。** 通过的夹具可能掩盖实际配置、项目发现或弃用方法例外的偏移。

## Consequences

测试通过真实 lint 可执行程序检查项目归属、获准及被拒的 Session 读取、暂存验证、输出通道和收敛修复。可变文件及其可能产生的构建产物属于工作区外的可丢弃项目。每个夹具将 lint 配置、相关 TypeScript 配置、根包清单和 Session 源文件复制到自己的临时目录。[Publint 子进程记录](2026-09-07-publint-test-subprocess-lifetime.zh.md)独立负责异步子进程的取消与关闭。
