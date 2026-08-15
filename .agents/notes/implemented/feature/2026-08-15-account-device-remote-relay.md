# Agent Note: Account-owned devices and outbound remote relay

Status: implemented

English | [中文](2026-08-15-account-device-remote-relay.zh.md)

## Problem

Direct [LAN access](2026-08-15-authenticated-lan-web-access.md) cannot reach a computer behind a home router from a mobile network, and exposing the Harness listener to the Internet would require port forwarding while placing a command-capable application on a public socket. Remote use needs account ownership, per-device revocation, and a server-mediated path without asking the desktop for a portal password or allowing the relay to choose arbitrary local targets.

## Decision

**The portal owns people, devices, and connection admission.** An independently deployed Go, MySQL, and Vue 3 service provides registration, login, user and device centers, browser device approval, online state, and one-time relay tickets. It is deliberately outside this repository because the public service has separate data, secrets, deployment, scaling, and incident ownership. The desktop stores only its versioned portal origin, explicit enabled state, and device credential in owner-only `remote-access.json`; the service stores device and session tokens only as SHA-256 digests.

**Desktop authorization uses the system browser and startup offers account onboarding.** When the installation has no persisted device authorization, the desktop explains before creating its product window that signing in enables use from a phone or another device. The user can start browser authorization or skip the offer and continue with local-only use; a previously authorized installation does not show the offer again. The desktop requests a short-lived high-entropy device code, opens the portal's same-origin approval page, and polls until the signed-in user approves it. The device token is derived with a server secret from the device-code digest, returned once, and never requires the desktop to collect account credentials. Authorization and remote control remain separate: approval leaves remote control disabled, and the success prompt or application menu must explicitly enable it. An unbound user who selects remote control is sent through authorization again, and no tunnel can start before that succeeds.

**Enabled devices establish one authenticated outbound WebSocket.** The main process connects to the portal with the device token and automatically reconnects while the preference remains enabled. The public relay multiplexes only bounded `/api` requests and application WebSocket streams over that connection; both the relay and desktop refuse non-API tunnel targets. Every request target is resolved against the ready Harness loopback origin and rejected if it escapes that origin; relay-supplied cookies, authorization, Origin, and browser metadata are not forwarded. Disabling the preference, revoking the device, restarting the local backend, or quitting the application closes the tunnel and its local WebSockets to quiescence.

**A dedicated relay authority serves a central Web shell and preserves API paths.** After an authenticated portal user selects an owned online device, the service exchanges a one-minute, single-use ticket for an HttpOnly relay session. The portal exports the version-matched Harness shell, boot graph, plugin bundles, styles, and fonts once and serves those cacheable files directly from the relay authority. Only root-relative `/api` traffic and the two application WebSocket downlinks cross the device tunnel, so loading or refreshing the UI does not consume the device's uplink or tunnel bandwidth. The relay validates its Host, browser Origin, account-device ownership, session expiry, revocation, and live tunnel before forwarding.

**Remote configuration is a read-only projection.** Sessions and agents remain usable because remote control is the feature's purpose, including the command and workspace capabilities already available to local Harness sessions. The central Web shell also needs `settings.describe` and `credentials.describe` to render the Models, General, Plugins, and Agent Presets surfaces without transport errors. The desktop therefore admits those two redacted reads but rewrites their capabilities before returning them: settings are non-writable and cannot open a Host document, while every credential reference is non-writable and never carries its value. Settings and credential writes, native directory selection, path opening, agent-preset management, and draft model discovery remain refused before they reach the loopback server. The tunnel normalizes HTTP method case and percent-encoded RPC names before applying that refusal so an alternate spelling cannot bypass it.

## Verification

Desktop tests pin skippable startup account onboarding, durable preference validation, same-origin browser authorization, bearer-authenticated tunnel startup, API-only fixed-loopback forwarding, non-API refusal, sensitive-header removal, read-only configuration projection, malformed-projection refusal, normalized privileged-method refusal, and continued blocking of writes. The desktop TypeScript build covers Electron menu and lifecycle integration. The independent portal's MySQL integration test exercises registration, session cookies, browser approval, one-time device-token delivery, authenticated device connection, online device listing, connection-ticket consumption, relay-session creation, central shell delivery without a tunnel frame, and a complete relayed API response; Go tests, `go vet`, and the Vue production build cover their respective artifacts.

## Alternatives considered

**Expose each desktop's local listener directly to the Internet.** Rejected because NAT and firewall configuration contradict zero setup, public inbound listeners expand attack and support burden, and certificate ownership would move to every user device.

**Collect the portal username and password inside Electron.** Rejected because the desktop would become a password-processing client and would have to reproduce registration, session, and multi-factor flows. System-browser approval keeps account authentication on the portal origin and gives the desktop only a revocable device credential.

**Make account authorization mandatory for local use.** Rejected because users must be able to skip onboarding and continue using Harness locally. Account authorization is mandatory only at the remote-control boundary, where an unowned device cannot safely enter the account-scoped relay.

**Let the relay name an arbitrary destination URL.** Rejected because a compromised or confused relay could turn every desktop into an internal-network proxy. The local ready URL is the only possible origin, and remote paths cannot replace its scheme or authority.

**Serve every device below a path on the portal authority.** Rejected because the existing client resolves static assets, APIs, and WebSockets from the origin root. A dedicated relay authority preserves those paths and isolates portal session cookies from device traffic. Its central shell is an exported, version-matched upstream build rather than a maintained downstream Web client fork.

**Add the portal source to this monorepo.** Rejected because the user requires an independently deployable sibling project, and the public service's database and operations do not share the desktop release lifecycle. This repository retains the desktop protocol, security decisions, and tests required to merge future upstream changes safely.

## Consequences

An account can own several macOS, Windows, and Linux desktops, see which are online, and connect from a mobile browser without changing the home network. An unbound installation advertises that benefit at startup but remains usable locally when onboarding is skipped. Remote control stays unavailable until authorization and remains off by default afterward; the desktop never receives the account password, and a revoked device loses both new connection admission and its live tunnel.

The service now carries Internet-facing account security and availability responsibilities: HTTPS/WSS termination, database backup, edge rate limits, monitoring, abuse response, capacity, and API relay bandwidth are operational requirements. Each desktop release must publish a compatible central Web-shell export with the portal; immutable asset caching makes ordinary page loads cheap, but a mismatched shell and device protocol is unsupported. The first protocol buffers complete API bodies with a fixed size limit rather than streaming uploads or downloads, one service instance owns the in-memory live-device registry, and horizontally scaled deployment therefore requires connection affinity or a shared tunnel-routing layer. Remote session and agent access is equivalent to operating Harness on that computer; the read-only configuration projection and native-operation exclusions do not make an agent's command execution read-only.
