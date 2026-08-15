# Agent Note: Read-only Workspace file manager and preview

Status: implemented

English | [中文](2026-08-16-workspace-file-manager-preview.zh.md)

## Problem

A conversation identifies the Workspace in which its agent operates, but the conversation surface offers no way to inspect that Workspace. Users must leave Harness and find the directory in an operating-system file manager even when they only need to read a README, inspect source, or check an image. That break is especially costly during portal remote use, where the user's phone cannot directly browse the remote computer's filesystem.

The feature must not turn a browser into an arbitrary filesystem reader. It needs an explicit Workspace ownership boundary, bounded payloads, path-containment rules that survive symlinks, and a mobile layout that coexists with the conversation composer.

## Decision

**The conversation owns a dedicated Files view for its registered Workspace.** The Workspace UI plugin registers `workspace-files` in `conversation.view`. It derives the current Session's Workspace from the existing client projection, browses one directory level at a time, and provides breadcrumbs, refresh, and an explicit hidden-file toggle. A Session that is not accounted to a registered Workspace receives an explanatory empty state rather than a path picker or an inferred cwd.

**The Host exposes only a bounded read-only projection.** `workspace.listFiles` and `workspace.readFile` resolve the requested `WorkspaceId` through the durable registry, then accept only portable relative paths. Absolute paths, backslashes, NUL, empty components, dot components, and parent components are rejected. The Host resolves the canonical Workspace root and every requested target; a symlink is usable only when its real target remains within that root. Successful responses contain relative paths and metadata, never the Workspace's absolute root.

One listing returns at most 1,000 direct entries. One preview returns at most 8 MiB of content. UTF-8 Markdown and common text/source/config formats travel as text; supported raster images, PDFs, and binary downloads travel as Base64. Larger files return metadata plus `too-large` without content. Directory and read failures use stable `workspace-file-*` business errors, and caller cancellation reaches filesystem work through the existing RPC signal.

**Preview is display-only and stays outside the model request.** Markdown uses the shared `MarkdownText` renderer, text uses a non-editable preformatted view, images use a contained image stage, and PDF uses the browser's embedded viewer. Bounded content can be downloaded from the client-created data URL, but the API defines no create, upload, write, rename, move, or delete method. Selecting or previewing a file never attaches its contents to the agent.

**Mobile navigation becomes one pane at a time.** Desktop widths show the directory and preview side by side. At 640px and below, opening a file replaces the list with a full-width preview and exposes an explicit Back action. Both panes reserve dynamic composer height and bottom safe-area clearance. The same compiled Web shell is served by the portal during remote use, while only these API calls cross the existing device relay.

## Verification

Host unit tests cover normal listing, Markdown/text/image/PDF/binary classification, hidden metadata, the 1,000-entry and 8 MiB limits, malformed relative paths, missing targets, directory-as-file refusal, symlinks that remain inside the root, and symlinks that escape it. API composition tests call both methods through a real Workspace registry and verify typed failures. Client tests cover Files-view registration lifecycle, navigation, hidden entries, Markdown preview, download, cancellation, errors, and the no-Workspace state.

The assembled Web browser test creates a real registered Workspace and Session, reaches the new RPCs through the production client graph, previews Markdown and an image, enters a nested directory, and repeats the interaction at 390 × 844. It rejects horizontal overflow, a squeezed preview, or a view that collides with the conversation composer. Full Client/Host builds and the existing GUI and Web suites remain release gates.

## Alternatives considered

**Reuse the operating-system file manager.** Rejected because it cannot serve a remote phone, does not keep browsing in conversation context, and exposes more desktop state than a bounded read-only projection needs.

**Send the Workspace absolute path to the browser and expose a generic read endpoint.** Rejected because remote clients do not need the Host path, and a generic path endpoint makes traversal, symlink, and mistaken-authority failures much harder to contain. The registry identity is the authority; relative paths select only descendants of that authority.

**Relay the complete Web page from every desktop.** Rejected because the portal already serves the versioned central Web shell. Relaying only API data keeps static assets cacheable and avoids spending device and server bandwidth on presentation resources.

**Add file editing in the first version.** Rejected because write operations need conflict handling, encoding rules, backup and recovery behavior, permission UX, and a stronger remote authorization policy. Read-only browsing satisfies inspection without silently expanding the mutation boundary.

## Consequences

Users can inspect the active project's files without leaving a conversation, including from a phone connected through the portal. The feature remains zero-configuration because it uses the Workspace already associated with the Session and requires no extra server, mount, or directory selection.

The view is intentionally not a full IDE or file manager. It has no editor, upload, filesystem mutation, search, archive browsing, syntax highlighting, or media streaming. Large directories and files report their bounds instead of paging or streaming, and inline PDF support varies by browser. File content crosses the API relay during remote preview, so the account and device trust boundary grants the remote browser the same bounded read access to registered Workspace files that the feature grants locally; users should enable remote control only for devices and accounts they trust.
