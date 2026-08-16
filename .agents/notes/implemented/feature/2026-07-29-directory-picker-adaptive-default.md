# Agent Note: Adaptive default for the directory-picker interaction

Status: implemented

English | [中文](2026-07-29-directory-picker-adaptive-default.zh.md)

## Problem

The [directory-picker seam](../architecture/2026-07-28-directory-picker-capability-seam.md) made the interaction a `cordis.yml` swap point, but the shipped composition still had to pin one backend: `-browse` everywhere meant a local operator never got the OS chooser, `-native` everywhere breaks every remote deployment. The right default depends on facts only the running host knows — where the server binds, whether the process was launched over SSH, whether a display session exists — so no static row is correct for all deployments.

## Decision

A third sibling package, **`dsh-host-directory-picker-auto`**, samples host facts once at boot and mounts a backend plus its client surface as Loader entries in the in-memory root tree. `native` requires a loopback bind, no SSH markers, and a display session the native backend can drive; anything ambiguous resolves to `browse`. The native backend exposes one stable `adaptive` capability containing native `pick` and browser `list`/`createDirectory` operations. The chooser pairs it with the browse client surface configured as `nativeOnLoopback`: a loopback page invokes the native picker, while a remote page renders the in-app directory browser. A browse resolution mounts the browse backend and the same client surface without that local arm. The disposer removes both entries and joins their teardown, and root-tree placement prevents either resolved row from being persisted to `cordis.yml`.

Entry-level mounting remains load-bearing because `dsh-client-modules` discovers the client surface from the Loader entry just like a configuration row. Per-page selection uses the already-derived `ctx.connection.isLoopback` fact and does not advertise the host capability on the wire. The desktop tunnel continues to block `host.pickDirectory`; remote selection uses only the forwarded `host.listDirectory` and `host.createDirectory` methods.

## Alternatives considered

- **Boot-glue resolution in `AppCLIEntry`** (ship both rows with static `disabled`, patch `disabled` from a `--directory-picker=auto|native|browse` flag). Works — `PatchOptions` patches metadata, and the modules scan skips disabled rows — but leaves the decision app-private where every future composition re-implements it; the chooser plugin gives any `cordis.yml` the same one-row adaptivity. Reintroduce the flag only when a deployment needs to *force* a backend without editing its yml.
- **One merged plugin branching per call** (client tries `pick`, falls back to the browse dialog on `directory-picker-unavailable`). Rejected: the client would need both flows in one bundle — the bundle-purity gate forbids cross-plugin value imports and jscpd forbids copying the dialog — and per-call probing pays a doomed RPC on every open of a browse host.
- **Resurrecting the wire advertisement** so both client flows mount and branch on the host's kind. Rejected: reverses the seam note's deletion for no consumer the chooser doesn't already serve, and collides with the `single` directory-flow holes.
- **Two simultaneously mounted client flows selected from a wire capability advertisement.** Rejected: the existing `single` directory-flow slots forbid competing occupants, and the page already knows whether it is loopback. One adaptive browse surface chooses the reachable arm without adding a protocol field or duplicating the dialog.

## Consequences

- The shipped desktop GUI uses the OS chooser locally and the in-app browser remotely from the same process. SSH, headless, unsupported-platform, or Linux-without-chooser launches use the in-app browser for every page.
- The chooser mounts backends by runtime string (`BACKEND_PACKAGES`, exported), which yml-row scanning cannot see; `verify-cordis-config` therefore requires every composition mounting `-auto` to declare both backends as dependencies, so keyless Linux CI (which only ever resolves `browse`) cannot hide a dropped `-native` dependency. The shipped-tree web e2e/snapshot lane (`apps/web/tests/scaffold.ts`) pins `-browse` by disable+insert patch — its goldens are interaction-specific and must not depend on the host running the suite.
- One backend resolution per boot keeps the seam's capability-stability contract; each connected page chooses the reachable interaction without changing that Host capability.
- Mounting the chooser **and** a backend row together fails loud (duplicate `directoryPicker` service; duplicate flow in the `single` holes).
- The host typecheck aggregate now references the two backend projects (declarations only, node entries carry no client merge) so the chooser's REAL-composition test can mount them — the mirror of the client aggregate's `webserver` reference.
