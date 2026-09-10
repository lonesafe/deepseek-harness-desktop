# Agent Note: Isolate Oxlint fixtures from workspace source discovery

Status: implemented

English | [中文](2026-09-10-isolated-oxlint-fixtures.zh.md)

## Problem

Oxlint probes written into real source directories can enter a concurrent TypeScript program before test cleanup deletes them. An observed typecheck failed with TS6053 for a removed Session probe. Random filenames prevent collisions between tests but do not isolate probes from source discovery or compiler output. The [coverage build ordering](../process/2026-08-18-in-job-partitioned-coverage.md) covers particular execution graphs; script fixtures must also tolerate independent source checks.

## Decision

The [Oxlint spec](../../../../scripts/oxlint-contract.spec.ts) owns a private `mkdtemp` project for every case that writes or fixes files. It copies the real lint configurations and relevant TypeScript configurations, retaining file layout, includes, exclusions, and local project ownership. Uncopied project references, source aliases, and ambient type roots resolve to the repository as read-only dependencies. The real CLI and repository runner execute with the private project as their working directory.

Session source is copied at `packages/core/session/src`, so deprecated-method diagnostics and the test-only `allow.from=file` exception exercise the actual declarations at the actual relative path. A synthetic declaration or a symlink to the repository would not preserve that evidence. The fixture links only `node_modules`; cleanup registers immediately after allocation and uses the shared junction-safe remover after synchronous children return.

## Alternatives considered

**Serialize source checks and script tests.** This would couple independent gates to fixture internals and leave separately invoked processes exposed.

**Exclude probe names from compiler and documentation scans.** Production discovery rules would acquire test-specific exceptions, while additional scanners could still observe transient files.

**Replace lint rules or Session declarations with synthetic equivalents.** A passing fixture could conceal drift in the shipped configuration, project discovery, or deprecated-method exception.

## Consequences

The spec checks project ownership, allowed and rejected Session reads, staged validation, output channels, and converging fixes through the real lint executables. Mutable files and any resulting artifacts belong to disposable projects outside the workspace. Each fixture copies the lint configurations, relevant TypeScript configurations, root package manifest, and Session source files into its temporary directory. The [publint subprocess note](2026-09-07-publint-test-subprocess-lifetime.md) independently owns asynchronous child cancellation and closure.
