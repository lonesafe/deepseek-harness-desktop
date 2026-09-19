# Agent Note: Separate Desktop Host and package-manager executables

Status: implemented
Archived: 2026-09-19

English | [中文](2026-09-15-desktop-packaged-runtime-executables.zh.md)

## Problem

The isolated Desktop distribution archives its production JavaScript in ASAR. Upstream Node cannot read Electron's virtual archive paths. Conversely, spawning the Electron executable as an ordinary Node binary for pnpm launches an application unless its Node mode is selected, and its directory does not provide the `node` command needed by package lifecycle scripts.

## Decision

Packaged Desktop starts its private Host through `process.execPath` with `ELECTRON_RUN_AS_NODE=1`. It resolves the archived dsh project through `app.getAppPath()` and selects the immutable [profile resolution generation](2026-09-09-profile-resolution-generations.md), which requires no directory links into ASAR.

The plugin manager keeps the separately bundled upstream Node executable and pnpm entry under `process.resourcesPath`. Package operations prepend that Node directory to their controlled `PATH`, so approved lifecycle scripts resolve the same ordinary runtime. Development uses its explicit Node override for both the Host and package manager.

This decision replaces the upstream-Node-only Host and unpacked-core choices in the [bundled runtime note](2026-09-08-desktop-bundled-runtime-and-external-plugins.md). That note remains active for package ownership, filtering, transactions, and plugin preservation. The profile-resolution note retains ownership of resolver precedence and Worker propagation. No note is fully superseded. The fork's `desktop:dist` Web distribution retains its separate packager and launch entry.

## Alternatives considered

- A single executable field cannot express both ASAR Host access and the ordinary `node` command required by pnpm scripts.
- Keeping the complete core outside ASAR would preserve upstream Node startup but discard the archived distribution and its runtime-resolution support.
- System Node and pnpm would make first launch and plugin management depend on user setup.

## Consequences

The release still carries Electron, upstream Node, and pnpm. Native modules must be qualified under the Host runtime that loads them. Startup tests assert both executable paths and runtime resolution, while package-manager tests exercise installation and lifecycle builds. Signed platform artifacts retain their release qualification requirements.
