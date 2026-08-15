# Agent Note: Authenticated LAN Web access

Status: implemented

English | [中文](2026-08-15-authenticated-lan-web-access.zh.md)

## Problem

The Web carrier already understands an all-interfaces bind and LAN Host authorities, but the shipped command rejects that bind because authority matching prevents DNS rebinding rather than authenticating a person. Exposing the application anonymously would give every device on the network access to sessions and agent operations, including workspace-backed command execution. The desktop product needs deliberate, reversible LAN access without making network exposure the default or forcing the local Electron window through a login prompt.

## Decision

**LAN exposure is a persisted desktop opt-in.** The application menu enables, inspects, copies, and disables LAN access. The launcher stores versioned `lan-access.json` state in Electron's per-user data directory, uses an owner-only atomic write, and preserves one randomly generated 32-character token across restarts and disable/enable cycles. Changing the preference replaces the managed backend generation; a failed new bind restores the previous file and backend before reporting the failure.

**An all-interfaces bind requires authentication at the Web carrier.** `dsh web --host 0.0.0.0` is accepted only with `--access-token` of at least 24 characters. Before route lookup, `dsh-host-webserver` redirects an unauthenticated non-loopback HTML navigation to a script-free Chinese login page; the fixed username is `deepseek`, and the configured token is the password. Successful form or HTTP Basic authentication issues a deterministic HttpOnly, SameSite=Lax session cookie derived from the token; later HTTP requests and WebSocket upgrades present that cookie, and remote authenticated responses are non-cacheable. Credential and cookie comparisons are timing-safe. Loopback sockets bypass the challenge because local processes already had full access before this feature, and the Electron window continues to load only the exact random loopback origin.

**Browser RPC ids cannot require a secure context.** A plain-HTTP non-loopback page has `crypto.getRandomValues()` but not `crypto.randomUUID()` in Chromium. The Web carrier therefore overrides RPC id minting with a local RFC 4122 version 4 formatter backed by `getRandomValues()`. This keeps the same random UUID shape and entropy while allowing the authenticated LAN page to complete its initial `host.describe` handshake.

**Authentication and browser trust remain separate checks.** The existing Host-authority fence still rejects cross-site and DNS-rebinding request forms after Web authentication. LAN IP literals are derived once from the active all-interfaces bind and remain its trusted authorities. Host settings, credentials, native file opening, and agent-preset authoring stay loopback-only; LAN users can operate sessions and agents but cannot widen the Host configuration plane.

## Verification

Webserver tests pin token requirements, loopback recognition, exact Basic credentials, session-cookie behavior, and the shared HTTP/upgrade authorization boundary. Client tests pin UUID minting when `randomUUID()` is absent and WebSocket operation without a secure-context dependency. The real Loader startup test proves that anonymous and weak all-interfaces invocations never release dependent rows, while an authenticated invocation does; a keyless real-CLI smoke reaches the server through a non-loopback interface and proves anonymous page/API rejection, form and Basic login, cookie-authorized API access, and a cookie-authorized WebSocket upgrade. A real Chromium smoke over the machine's LAN address completes the login form and reaches a stable connected application surface. Desktop tests pin random credential persistence, malformed-file refusal, LAN argv construction, and readiness parsing; the desktop package build covers the Electron main-process integration.

## Alternatives considered

**Expose the existing all-interfaces server without authentication.** Rejected because the application provides workspace and command-execution capabilities; network location is not an identity or consent boundary.

**Enable LAN access on every desktop launch.** Rejected because users on public or shared networks must not expose Harness without an explicit action. Persisting an opt-in preserves convenience without changing the safe default.

**Put the token in a query string or rely only on browser-native Basic authentication.** Query strings leak into history, logs, and copied links, while URL Basic credentials do not carry through Chromium's WebSocket construction. The dedicated same-origin login route keeps credentials out of URLs, uses no script, accepts only a bounded form body, and establishes the minimal cookie session used by both HTTP and WebSocket requests.

**Require users to deploy a reverse proxy.** Rejected as the only desktop path because it contradicts the self-contained client goal. A TLS reverse proxy remains the deployment path when the LAN itself is not trusted.

## Consequences

One menu action makes the running desktop backend reachable from phones and computers on the same network, and the application presents the address, username, and token needed by their browser. Local desktop use remains unchanged, disabling the feature returns the server to loopback-only binding, and corrupt persisted security state fails closed instead of silently exposing a port.

Direct LAN traffic and login credentials remain plaintext because the embedded server does not terminate TLS. The feature is suitable only for trusted networks; it has one process-wide credential, no per-device revocation or rate limit, may trigger an operating-system firewall prompt, and requires a restart to change exposure. The desktop child receives the token in its argument list, so other processes running as the same operating-system user may be able to inspect it; that user already controls the Harness data and process.
