# Agent Note: Portal-hosted desktop update channel

Status: implemented

English | [中文](2026-08-16-portal-hosted-desktop-update-channel.zh.md)

## Problem

Desktop users need to discover and install current macOS, Windows, and Linux packages without monitoring repository releases. Pointing every installed client at GitHub would make availability depend on a third-party release API, expose repository-specific asset naming to the application, and prevent the product website from remaining the authoritative download surface. At the same time, the sandboxed Web renderer must not gain filesystem or process privileges merely to display an update affordance.

## Decision

The independently deployed portal owns release metadata and package storage. A MySQL release row records the version, title, notes, and publication time; each immutable asset records its platform, architecture, package kind, file name, byte size, and SHA-256 digest. Public endpoints list downloads and select the preferred package for a current version and target, while package bytes are served from the portal origin with range support. A bearer-protected multipart endpoint computes size and SHA-256 server-side and atomically replaces one version/platform/architecture/kind asset. The website presents these same portal URLs by platform and architecture.

GitHub remains the public source and build-release record, but it is not an installed client's update origin. After a normal GitHub Release is complete, its published assets are downloaded and uploaded to the portal version center. The portal therefore becomes the source used by both the website download page and desktop clients, and no update response may redirect a client to GitHub.

Electron adds non-secret current version, platform, architecture, and validated portal origin query facts only when it loads its exact random loopback application URL. Ordinary LAN and remote pages receive no facts and perform no update polling. The settings shell validates all four values, checks the portal immediately after page startup, and then uses one non-overlapping check every 600,000 milliseconds. A newer compatible asset adds a compact update badge to the right of the lower-left Settings trigger; an unavailable portal does not interrupt the user's work or remove local functionality.

The badge targets only the exact internal `dsh-update://download` action. The desktop navigation guard consumes that action instead of handing a package URL to the renderer or operating system. The Electron main process independently queries the configured portal again, requires the selected package URL to remain on that origin under `/downloads/`, asks the user before transfer, downloads into a unique temporary file, and verifies exact length and SHA-256 before atomically copying it to Downloads. Failed, canceled, short, oversized, or mismatched transfers leave no published installer and are never opened. A verified DMG, NSIS executable, ZIP, DEB, or executable AppImage is handed to the operating system; the application also exposes the same explicit check through its native menu.

## Verification

Desktop unit tests pin loopback metadata injection, portal-only release selection, rejection of GitHub package URLs, byte-exact streaming, SHA-256 rejection, temporary-file cleanup, and collision-free publication. Browser tests pin complete marker validation, immediate discovery, the exact ten-minute interval, absence in ordinary browsers, same-origin download validation, and the Settings-adjacent badge. Portal tests pin semantic prerelease ordering and platform/package validation; MySQL integration and production smoke tests cover upload, listing, preferred selection, range-capable download, CORS discovery from the random loopback origin, and checksum agreement. Desktop packaging and a local installed-application run cover the main-process action, progress reporting, and system handoff.

## Alternatives considered

**Use GitHub Releases directly from every client.** This couples installed applications to GitHub API availability and rate limits and contradicts the portal's role as the product download surface. The release pipeline may originate on GitHub while distribution remains portal-owned.

**Give the renderer a preload filesystem download API.** The application deliberately has no preload bridge. The exact internal navigation action preserves renderer sandboxing, while the main process revalidates all untrusted release metadata before touching disk.

**Download automatically as soon as a version is discovered.** Background transfer would consume bandwidth and create files without user intent. Discovery is automatic, but transfer and installation remain explicit user actions.

**Trust TLS without a package digest.** TLS protects transport to the portal but does not detect a truncated file or a metadata/storage mismatch. Exact byte length plus SHA-256 binds the downloaded bytes to the version record before execution.

## Consequences

Users see an unobtrusive update indicator in the existing lower-left navigation and obtain packages from the same official website on every platform. Checks occur at startup and every ten minutes without blocking sessions, and temporary portal outages do not disable the desktop runtime. Package integrity is verified before system handoff, and the sandboxed renderer never receives local filesystem authority.

The portal now owns durable binary storage, upload credentials, database migration, backup, capacity, and download bandwidth. A Release is not fully distributed until every intended GitHub asset has been copied to the portal and its recorded digest has been verified. The client intentionally does not silently install or restart: unsigned macOS builds may still require the README's one-time Gatekeeper approval, and operating-system package behavior remains visible to the user.
