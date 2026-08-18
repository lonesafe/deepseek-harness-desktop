# Agent Note: DeepSeek account balance indicator

Status: implemented

English | [中文](2026-08-18-deepseek-account-balance-indicator.zh.md)

## Problem

Users can configure and consume an official DeepSeek API key without seeing whether that provider account still has spendable funds. Discovering an exhausted balance only after a model request fails interrupts active work, while querying the provider directly from the browser would expose the bearer credential to both the desktop renderer and the public remote Web shell.

## Decision

The LLM adapter boundary owns optional account-balance reads. `LlmAdapter.accountBalance()` defaults to `BALANCE_UNSUPPORTED`; `LlmRuntime.accountBalance()` selects the registered provider, validates the returned availability and unique decimal currency rows, and detaches the result. Monetary fields remain decimal strings from provider response through RPC and presentation, avoiding floating-point rounding.

The direct DeepSeek adapter resolves the same operation-local `baseURL` and credential used by model calls, then sends an attributed bearer-authenticated `GET /user/balance`. It validates the JSON shape before returning total, granted, and topped-up amounts. Provider HTTP, transport, cancellation, credential, and malformed-response failures remain typed `LlmError` failures and never include the key.

The Host exposes the result through the read-only `llm.balance` RPC. The request carries only the registered route name, and the response carries only availability and balance rows. The desktop tunnel forwards this method to authenticated remote browsers because the payload contains no endpoint, configuration value, or credential. The shared Models client plugin contributes one right-aligned session-header utility, so desktop and remote Web rendering use the same component. It loads at startup, refreshes after DeepSeek settings or credential invalidation and connection reset, and supports an explicit click refresh. Narrow screens hide the label while retaining the amount.

## Verification

Core tests cover unsupported adapters, detached results, decimal preservation, and invalid metadata. DeepSeek adapter tests cover the exact endpoint, bearer and attribution headers, response mapping, and malformed rows. API carrier tests cover request and response schemas, dispatch, error mapping, and the remote forwarding classification. Client tests cover CNY presentation, breakdown copy, unavailable state, manual refresh, slot registration, disposal, and HMR re-registration. GUI and Web regression suites cover the assembled desktop and remote layouts.

## Alternatives considered

**Query DeepSeek directly from the browser.** Rejected because the renderer would need the raw API key, and a remote browser would send that credential across the public relay. The Host already owns credential resolution and provider transport.

**Store provider balances in the portal account database.** Rejected because the balance belongs to the configured DeepSeek credential, not the portal user account. Mirroring it in the portal would require collecting provider keys or building a synchronization system with stale financial data.

**Convert amounts to JavaScript numbers for formatting.** Rejected because binary floating-point cannot preserve every decimal monetary value exactly. Currency symbols are presentation-only; the protocol retains the provider strings.

**Make balance support mandatory for every adapter.** Rejected because many providers expose no equivalent endpoint or use ambient cloud billing. An optional capability keeps those adapters valid while giving consumers one stable unsupported result.

## Consequences

Users see the currently configured official DeepSeek account total before and during work in both desktop and remote Web clients, and can inspect its funded and granted portions without opening provider settings. A missing key, unsupported custom endpoint, network failure, or provider refusal renders an unavailable marker rather than blocking conversation use.

Each visible application startup performs one additional provider request when the Models client plugin loads, and relevant configuration changes or manual clicks perform another. The displayed value is a point-in-time read rather than a per-token ledger; it can remain stale between refreshes. Custom DeepSeek-compatible endpoints must implement `/user/balance` to produce a value, otherwise the indicator remains unavailable while model calls continue to work.
