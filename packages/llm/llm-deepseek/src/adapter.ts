/** Select a DeepSeek wire implementation from one validated configuration generation. */
import { assertNever } from '@deepseek-ai/dsh-util-values'
import { attributionHeaders, LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, LlmAccountBalance, PreparedAdapterCall, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { DeepSeekAdapterOptions } from './common/types.ts'
import { ChatCompletionsAdapter, httpErrorCode } from './protocols/chat-completions/adapter.ts'
import { DeepSeekFileStore } from './common/file-store.ts'
import type { WireError } from './protocols/chat-completions/types.ts'
import { DeepSeekMessagesAdapter } from './protocols/messages/adapter.ts'

/** One provider route with protocol-local transport and shared credentials and model configuration. */
export class DeepSeekAdapter extends LlmAdapter {
  private readonly files: DeepSeekFileStore

  constructor(private readonly dependencies: DeepSeekAdapterOptions) {
    super()
    this.files = dependencies.resolveFiles?.() ?? new DeepSeekFileStore()
  }

  /** Query the official/current endpoint associated with this route's key. */
  override async accountBalance(_provider: string, signal?: AbortSignal): Promise<LlmAccountBalance> {
    const connection = this.dependencies.options()
    const apiKey = await this.dependencies.resolveApiKey(connection)
    const root = connection.baseURL.replace(/\/+$/, '')
    const accountRoot = connection.protocol === 'messages' ? root.replace(/\/anthropic$/, '') : root
    let response: Response
    try {
      response = await fetch(`${accountRoot}/user/balance`, {
        method: 'GET',
        redirect: 'error',
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept: 'application/json',
          ...attributionHeaders(),
        },
        ...signal === undefined ? {} : { signal },
      })
    } catch (error: unknown) {
      if (signal?.aborted) throw new LlmError('DeepSeek balance request aborted by caller', 'ABORTED', { cause: error })
      throw new LlmError(`DeepSeek balance request to ${connection.baseURL} failed`, 'TRANSPORT', { cause: error })
    }
    if (!response.ok) {
      let providerError: WireError['error']
      try {
        providerError = (await response.json() as WireError).error
      } catch {
        // The HTTP status remains authoritative when the error body is malformed.
      }
      throw new LlmError(
        providerError?.message ?? `DeepSeek balance API error (HTTP ${response.status})`,
        httpErrorCode(response.status, providerError),
        { status: response.status },
      )
    }
    let value: unknown
    try {
      value = await response.json()
    } catch (error: unknown) {
      throw new LlmError('DeepSeek balance API returned invalid JSON', 'INVALID_BALANCE', { cause: error })
    }
    if (typeof value !== 'object' || value === null) {
      throw new LlmError('DeepSeek balance API returned an invalid response', 'INVALID_BALANCE')
    }
    const wire = value as { is_available?: unknown; balance_infos?: unknown }
    if (typeof wire.is_available !== 'boolean' || !Array.isArray(wire.balance_infos)) {
      throw new LlmError('DeepSeek balance API returned an invalid response', 'INVALID_BALANCE')
    }
    const decimal = /^-?\d+(?:\.\d+)?$/
    const balances = wire.balance_infos.map((row: unknown) => {
      if (typeof row !== 'object' || row === null) {
        throw new LlmError('DeepSeek balance API returned an invalid balance row', 'INVALID_BALANCE')
      }
      const item = row as Record<string, unknown>
      if (
        typeof item.currency !== 'string'
        || typeof item.total_balance !== 'string'
        || typeof item.granted_balance !== 'string'
        || typeof item.topped_up_balance !== 'string'
        || !decimal.test(item.total_balance)
        || !decimal.test(item.granted_balance)
        || !decimal.test(item.topped_up_balance)
      ) {
        throw new LlmError('DeepSeek balance API returned an invalid balance row', 'INVALID_BALANCE')
      }
      return {
        currency: item.currency,
        totalBalance: item.total_balance,
        grantedBalance: item.granted_balance,
        toppedUpBalance: item.topped_up_balance,
      }
    })
    return { isAvailable: wire.is_available, balances }
  }

  private implementation(): LlmAdapter {
    const connection = this.dependencies.options()
    switch (connection.protocol) {
      case 'messages':
        return new DeepSeekMessagesAdapter({
          connection: () => connection,
          apiKey: this.dependencies.resolveApiKey,
          userId: this.dependencies.resolveUserId,
          attachments: () => this.dependencies.resolveAttachments?.(),
          imageAccess: (ref) => {
            const attachments = this.dependencies.resolveAttachments?.()
            return attachments === undefined ? undefined : this.dependencies.resolveImageAccess?.(attachments, ref)
          },
          files: () => this.files,
          prepareExtensions: this.dependencies.prepareExtensions,
          ...this.dependencies.onReplayDegrade === undefined ? {} : { onReplayDegrade: this.dependencies.onReplayDegrade },
        })
      case 'chat-completions':
        return new ChatCompletionsAdapter({ ...this.dependencies, options: () => connection, resolveFiles: () => this.files })
      /* v8 ignore next -- protocol is validated at configuration resolution. */
      default: return assertNever(connection.protocol, 'DeepSeek protocol')
    }
  }

  override providerInfo(provider: string) { return this.implementation().providerInfo(provider) }
  override providerRetryPolicy(provider: string) { return this.implementation().providerRetryPolicy(provider) }
  override listModels(provider: string) { return this.implementation().listModels(provider) }
  override resolveModel(provider: string, model: string, signal?: AbortSignal) {
    return this.implementation().resolveModel(provider, model, signal)
  }
  override imageRequestPricing(provider: string, model: string) {
    return this.implementation().imageRequestPricing(provider, model)
  }
  override prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    return this.implementation().prepareCall(provider, model, signal)
  }
  stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.implementation().stream(options)
  }
}
