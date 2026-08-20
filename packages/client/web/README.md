# @deepseek-ai/dsh-client-web

English | [中文](README.zh.md)

Web boot kernel: `new AppWebEntry(el, seams?).run()` mounts the client through two stages. The module stage calls the Host-installed `window.__ModuleLoader__.create()` with `window.__DSH_BOOT__`, the shell's static modules, and any test transport override; the facade returns the constructed module system and parsed manifest after adopting parser-preloaded registrations. This package then prefetches the `immediately` tier. The plugin stage mounts the vendored Cordis Loader, injects that module system through the Loader's `internal` interface, creates every graph entry uniformly, and waits for every fiber to become ACTIVE. It then hands the marked boot DOM to the dynamic UI renderer's `ctx.uiRenderer.mount(el)` operation; the renderer hydrates that DOM before switching to the complete UI. The Host owns the graph, parser preloads, and facade; AppWebEntry does not know the bootstrap package id or parse the wire format.

The boot page uses plain DOM and local CSS, so client-bundle and plugin-activation failures remain visible. Its fallback fonts and colors match the theme tokens that arrive during loading. Fiber updates retain one spinner node and grow its CSS arc as entries first become active; hydration preserves that node and its animation phase until the application commit. React mounting, slot rendering, application assembly, and browser-title projection live in [`ui-renderer`](../ui-renderer/README.md). The modules bundle caches its own materialized exports and provides the closed-over system when its ordinary graph entry activates; Cordis service waiting makes graph-row creation order independent from that activation.

`PLATFORM_MODULES` (src/platform.ts) is the single source of truth for shell-seeded shared modules. Together with `PRELOADED_CLIENT_EXTERNALS`, it defines the implicit external baseline for every dynamic bundle; `dsh.client.external` adds only exact non-baseline requests.

The optional override parameter `seams` forwards the module system's `loadBundle` transport override (`BootSeams`) for environments where external `<script>` execution cannot reach the page context; ordinary browser callers omit it.

The shell owns browser-title projection. With a selected session carrying a durable title, it renders `<session title> — <existing HTML title>` and reacts to later title revisions; no selection or a selected untitled session preserves the existing title, and shell unmount restores it. The existing HTML title remains the configurable product suffix.

The shell root uses the dynamic viewport height where supported and prevents body-level scrolling. Phone browser chrome can therefore resize the application without leaving the bottom composer below the visible area; feature packages own their own safe-area insets and compact controls.
## Model Experience

None, as the entry shell boots the browser plugin tree; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **One-shot rendering by design** — the UI waits for the boot settle; a single entry failure keeps the loading page with a loud per-entry report, no partial availability (progressive rendering returns with its own project).
- **Phone coverage exercises the primary active-session path** — the assembled browser lane fixes a 390 × 844 running-turn geometry contract for full-width conversation and a non-overflowing composer; other device shapes continue to rely on the same responsive CSS rather than separate goldens.
