# Agent Note: Chinese-default repository landing page

Status: implemented

English | [中文](2026-08-15-chinese-default-repository-readme.zh.md)

## Problem

GitHub renders the unsuffixed root `README.md` as the repository landing page. The standard [bilingual sibling-file decision](2026-07-02-bilingual-docs-and-pairing-gate.md) assigns that path to English and `.zh.md` to Chinese, so visitors see English first even when this desktop distribution primarily serves Chinese readers. Labeling the Chinese link as preferred does not change the page GitHub renders.

## Decision

- The root `README.md` contains the complete Chinese landing page, and `README.en.md` contains the complete English version. Each file links directly to the other below its H1 heading.
- `README.md` is an explicit entry in `scripts/translation-pairing.manifest.json`; the root `.zh.md` counterpart and `.i18n.yaml` record do not exist. All other in-scope READMEs retain the standard three-file pairing rule.
- Markdown link, physical-line, and Mermaid checks explicitly include both root landing files. The translation-prompt verifier continues to use them as a reviewed English/Chinese example with their localized filenames.

## Verification

`verify-translation-pairing` rejects an old root `.zh.md` or `.i18n.yaml` artifact, while `verify-md-links`, `verify-md-wrap`, and `verify-mermaid` inspect both current files. The translation-prompt runnable snapshot pins their use as one reviewed example pair.

## Alternatives considered

- **Keep English at `README.md` and mark Chinese as preferred.** Rejected because the GitHub landing page would still display English by default.
- **Put English in `README.zh.md`.** Rejected because the filename would misidentify the language and mislead direct-link users and tooling.
- **Generalize the pairing gate for configurable source-language filenames.** Rejected because a repository-root landing page is the only required exception; adding another pairing mode would expand merge, discovery, and recovery logic for no additional document.

## Consequences

GitHub visitors see the complete Chinese README without selecting a language, while the English version remains one link away. The root pair does not receive blob-hash drift detection, so edits to either landing file must update the other in the same change and rely on review for semantic consistency. If another Chinese-default document is required, the pairing gate must gain a general alternate-filename mode instead of adding another exclusion.
