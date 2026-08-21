# Agent Note: 中文默认仓库首页

Status: implemented

[English](2026-08-15-chinese-default-repository-readme.md) | 中文

## 问题

GitHub 会将根目录中不带语言后缀的 `README.md` 渲染为仓库首页。标准[双语兄弟文件决策](2026-07-02-bilingual-docs-and-pairing-gate.zh.md)将该路径分配给英文，并将 `.zh.md` 分配给中文，因此即使这个桌面发行版主要面向中文读者，访问者仍会先看到英文。把中文链接标记为首选并不能改变 GitHub 渲染的页面。

## 决策

- 根目录 `README.md` 包含完整中文首页，`README.en.md` 包含完整英文版。两个文件都在 H1 标题下方直接链接到另一种语言。
- `README.md` 是 `scripts/translation-pairing.manifest.json` 中的显式条目；根目录不存在 `.zh.md` 对侧文件和 `.i18n.yaml` 记录。范围内的其他 README 继续遵循标准三文件配对规则。
- Markdown 链接、物理行与 Mermaid 检查显式包含两个根目录首页文件。翻译提示词校验器继续将它们及其本地化文件名作为一组经评审的中英示例。

## 验证

`verify-translation-pairing` 会拒绝旧的根目录 `.zh.md` 或 `.i18n.yaml` 产物，`verify-md-links`、`verify-md-wrap` 与 `verify-mermaid` 则检查当前的两个文件。翻译提示词可运行快照会固定它们作为一组经评审示例的用法。

## 曾考虑的替代方案

- **在 `README.md` 中保留英文，并把中文标为首选。** 否决：GitHub 仓库首页仍会默认显示英文。
- **把英文放进 `README.zh.md`。** 否决：文件名会错误标识语言，并误导直接访问链接的用户和工具。
- **让配对门禁支持可配置的源语言文件名。** 否决：仓库根目录首页是唯一需要的例外；新增配对模式会扩展合并、发现和恢复逻辑，却不能服务更多文档。

## 后果

GitHub 访问者无需选择语言即可看到完整中文 README，英文版仍可通过一个链接访问。根目录配对不再获得 blob hash 漂移检测，因此修改任一首页文件时都必须在同一项更改中更新另一文件，并依靠评审判断语义一致性。如果今后需要另一篇中文默认文档，配对门禁必须增加通用的替代文件名模式，而不能继续添加例外。
