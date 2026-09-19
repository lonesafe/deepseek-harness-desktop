# Agent Note: Bundle the Desktop runtime and retain external plugins

Status: implemented

English | [中文](2026-09-08-desktop-bundled-runtime-and-external-plugins.zh.md)

Profile mutation and recovery follow the [in-place profile decision](2026-09-09-desktop-in-place-profile.md).

## Problem

Installing the core dependency graph during Desktop initialization repeats work already done by the release builder. An offline store eliminates downloads but retains extraction, package-manager startup, and installation costs. Users need the application to start with its production packages present while retaining ordinary npm plugin installation and plugin state across application upgrades.

Separate package directories can load duplicate Cordis or service modules. Retaining plugin files also does not prove compatibility with a new host API or Node runtime.

## Decision

[Runtime preparation](../../../../apps/desktop/scripts/prepare-dsh.ts) materializes the production graph once at build time. Packaged Desktop archives that tree in `app.asar/dsh`, unpacks native executables, and runs the private Host through Electron Node mode. Bundled upstream Node runs pnpm and approved plugin builds. The [executable decision](2026-09-15-desktop-packaged-runtime-executables.md) owns this runtime split.

The isolated Desktop profile uses its first installation format and provides no reader or migration for its unpublished seed-based profile. This note supersedes core seed installation and single-project dependency ownership in the [Desktop packaging decision](2026-08-25-electron-desktop-packaging-and-updates.md). That note continues to own release identity, signing, portless transport, process ownership, and Electron-only plugin authorization.

## Package ownership

The resource descriptor records the exact release, Node version, platform, architecture, shared package versions, and prepared file hashes. Runtime preparation materializes ordinary files without links back to pnpm's build store. Native Mach-O files are signed before hashing. Explicit `dsh/node_modules` file mappings bypass electron-builder's root `node_modules` exclusion; the application signer preserves pre-signed unpacked native files.

The [Desktop file policy](../../../../apps/desktop/scripts/runtime-file-policy.ts) applies after production npm installation and before native signing or descriptor generation. npm publication lists serve library consumers and can include declarations, maps, tests, and native build inputs; they do not identify the files needed by the Desktop process. The Desktop copy omits declarations and recognized source maps because Host execution uses JavaScript and generated Typert artifacts, clears inherited `NODE_OPTIONS`, and does not enable source mapping. Reviewed plugin lifecycle builds cover native dependencies, not arbitrary TypeScript compilation. Published npm packages and external plugin directories retain their own files. Source debugger navigation is a development-package capability.

Package-specific exclusions remove Domino tests, fs-ext compilation outputs, Koffi's Windows import library, and non-target node-pty prebuilds and debug symbols. The policy retains native executable dependencies, node-pty's ConPTY source distribution, licenses, and unrecognized assets; broad `src`, `test`, `.ts`, or `.map` exclusions could remove executable code or runtime data. Copy tests preserve sentinel assets and seal the filtered inventory; the bundled-Node [payload smoke](../../../../apps/desktop/tests/fixtures/runtime-payload-smoke.mjs) verifies PTY output, native file seeking, FFI, image conversion, and HTML parsing. Runtime preparation still verifies every retained byte and boots the complete Host with an external plugin.

Every first-party package in the dsh and private Host production closures is shared. Packaged Desktop supplies host-package lookup through the [profile resolver](2026-09-09-profile-resolution-generations.md). Development profiles use directory symlinks or Windows junctions. Distinct ESM and CommonJS conditional exports remain distinct entry points; shared lookup cannot merge dual implementations.

External plugins declare shared host packages as peers. Ordinary dependencies remain plugin-owned and may differ from the versions used by dsh. Validation rejects incompatible enabled peers, private package links, and dependencies resolving outside the profile. Development link mode additionally rejects nested or aliased copies of shared packages. The profile resolver owns packaged lookup precedence.

The profile manifest records exact installed plugin dependencies separately from its enabled bundle list. Disabling a plugin preserves its package, lockfile entry, and user configuration. Packaged profiles record runtime identity without creating shared links. Development links are Desktop-owned derived state; package operations remove them and recreate them afterward.

## Transactions and upgrades

First launch creates profile metadata without running pnpm, preserving unrelated files. Compatible release changes refresh runtime identity and validate enabled peers in place. Each packaged Host constructs its resolution generation from the current application. Node version, platform, or architecture changes reinstall the locked plugin graph and run approved native builds.

Native canonical paths identify shared package directories. Windows launchers can vary path casing without moving the application; string equality would trigger unnecessary profile preparation. Profile cleanup explicitly unlinks every nested directory link before removing real directories. A Windows fixture under Electron 44 reproduces recursive `fs.rmSync` deleting files through a nested junction, while bundled upstream Node 24.17 preserves them. Cleanup qualification therefore includes the real Electron runtime; Node-only tests do not establish target preservation.

Dependency mutations install with scripts disabled, validate the plugin graph, run reviewed pending lifecycle builds, and validate again. The `allowBuilds` policy remains explicit; unsupported build-requiring dependencies fail the transaction.

Desktop stops the Host before package mutations and waits for pnpm exit before restarting it. The [in-place decision](2026-09-09-desktop-in-place-profile.md) owns partial failures and persistent retry state. In development link mode, recorded host links identify owned directories independently of package-operation completion.

The [immediate-window decision](2026-09-09-desktop-immediate-window-and-direct-start.md) owns direct Host startup and recovery in the main window. Users can update, remove, disable, or re-enable plugins and retry startup. Incompatible plugins are not silently deleted or automatically downgraded. Each backend launch requires the current runtime identity.

## Alternatives considered

Full runtime verification belongs to packaging. Startup reads the descriptor, checks shared package records and required Host entries, and uses the recorded runtime identity for profile reuse. The [release-validation decision](2026-09-09-desktop-build-release-validation.md) assigns release and target compatibility checks to packaging. It neither enumerates nor hashes installed runtime files, including on first launch or after an upgrade. Reading every file before backend loading adds startup I/O proportional to the distribution size. Installed content changes therefore are not detected by a startup checksum comparison; unusable modules fail when loaded. Build-time verification still rejects changed, missing, extra, or linked files against the recorded inventory.

- **Install the bundled offline seed at startup.** This preserves an ordinary pnpm installation procedure but repeats core extraction and installation on every affected machine. Materialized resources remove that work at the cost of more application files and release-builder responsibility.
- **Link all host dependencies into plugins.** This unnecessarily couples ordinary plugin dependencies to the host. Only the explicit shared inventory is linked; private packages retain independent versions.
- **Use hardlinks.** They cannot represent directories, may not cross volumes, share writable bytes, and retain old inodes after application replacement. Directory symlinks and Windows junctions express the intended package target.
- **Use `NODE_PATH` or preserve symlink paths.** These do not provide uniform ESM resolution or shared module identity. Normal package lookup through explicit links is directly testable.
- **Use upstream Node to read ASAR.** It lacks Electron filesystem support. The [executable decision](2026-09-15-desktop-packaged-runtime-executables.md) selects Electron Node mode for archived Host code and upstream Node for package operations.

## Consequences

Core package installation is absent from first launch and compatible upgrades. Metadata checks and backend loading still cost startup time; no release latency or download-size improvement is claimed without measurement. Plugin preservation is conditional on host API and native runtime compatibility, with a visible recovery path when that condition fails.

The [Desktop README](../../../../apps/desktop/README.md) owns operational guidance. Focused tests cover real pnpm installation and approved builds, shared ESM instance identity, private dependency versions, relocation, disabled plugins, native rebuild selection, activation failures, and transaction locking. Signed installed-artifact upgrades, macOS notarization, Windows junction/native behavior, release size and startup benchmarks, and real-model GUI recordings remain release-environment qualification requirements; unit fixtures do not substitute for them.
