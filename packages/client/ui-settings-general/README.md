# @deepseek-ai/dsh-client-ui-settings-general

English | [中文](README.zh.md)

Settings shell, ownerless copy, and durable product-onboarding namespace. It occupies `sidebar.settings` with the trigger chrome and modal settings panel, renders ordered `settings.footer.utility` controls between the trigger and desktop version/update chrome, projects the `settings.section` ledger into the navigation and the `settings.onboarding` ledger into one mounted step at a time, and registers everything on the Settings pages that belongs to no single feature — the trigger/header/close chrome content, the local configuration-file action, the General section and its `settings.general.item` slot, and the `settings` dictionaries. The slot types it renders into belong to ui-settings, the settings domain base; only the shell's own contract types live here, because they reference ui-sidebar's slot type and the base layer must depend on no `ui-*` package. Feature-owned footer utilities, rows (Permission, Language, Appearance), sections (Models), and conditional onboarding steps stay with their feature packages.

At phone widths, the settings title and actions stay above a horizontally scrollable section rail, while the active section owns the full panel width and scrolls inside the dialog. The open panel portals to the document body, so responsive sidebar collapse cannot clip it or expose the conversation to pointer input. Desktop widths retain the two-column navigation and content layout.

When Electron supplies its non-secret desktop version, target, and validated portal origin on the managed loopback URL, the shell checks the portal immediately and every ten minutes without overlapping requests. A newer compatible portal asset adds an **Update** badge to the right of the Settings trigger. The badge invokes the desktop-owned update action; ordinary LAN and remote browsers receive no desktop facts, perform no checks, and render no badge.

The same trusted desktop facts add a **Remote control** row to General Settings. Its **Manage** action opens the Electron-owned remote-access dialog for browser authorization, enable/disable state, connection status, and the portal device center. The row is absent from LAN and portal-remote browsers; the native application menu remains an equivalent entry point.

The shell ships no onboarding copy of its own — all text arrives from registrants. Nav labels may be locale-following thunks, so the nav projection resolves them through `resolveSlotLabel` and re-renders on the section ledger bump or the locale revision (an optional `ctx.get('locale')` read; no hard locale dependency). The onboarding ledger projects in ascending order and mounts exactly one step at a time. Visible steps own their dialog chrome and app-root `inert` lifecycle; a mounted step still resolving private facts renders null, so nothing paints or blocks while it decides. The active registrant receives its id, `complete()`, and an `openSection(id)` callback; completing or skipping transfers ownership to the next entry. Registrants own durable completion, capability readiness, copy, mutations, and their visible wrapper, so independently registered flows cannot stack and the shell does not become a second configuration fact source.

A loopback browser loads the provider's `hasDocument` capability through `settings.describe` and renders **Open configuration file** only when the Host confirms that a provider-owned local document can be prepared. The action sends the pathless, loopback-only `settings.openDocument` request; the Host resolves the provider path again, materializes an absent document, and hands it to a native text editor (`open -t` on macOS, bypassing a browser file association; the desktop file association on Linux and Windows; Windows association after `wslpath -w` translation on WSL). Open failures keep the action available and render a localized error. Reopening the dialog or reconnecting refreshes availability after a transient read failure or Host topology change. Remote browsers never register the action and never issue the privileged settings read.

The Host half registers `ui-onboarding` in the user-settings seam. The welcome step contributed by `ui-settings-models` reads and writes its `welcomeNoticeVersion` through the existing public settings boundary; the shell itself remains policy-free.

## Model Experience

None, as the plugin renders browser settings UI; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- Most General rows appear only when their owning feature plugin is mounted; the desktop-only Remote control row additionally requires trusted Electron URL facts.
