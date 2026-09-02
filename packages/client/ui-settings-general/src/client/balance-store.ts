/** DeepSeek account-balance state shown beside the Settings trigger. */

import type { ClientRemote, LlmAccountBalance } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'

/** Official DeepSeek route whose configured credential owns the balance. */
export const DEEPSEEK_OFFICIAL_PROVIDER = 'deepseek-official'

/** Current balance-query state. */
export type BalanceState = {
  status: 'loading' | 'ready' | 'error'
  isAvailable: boolean
  balances: LlmAccountBalance['balances']
  error: string | null
}

/** Latest-wins controller for the read-only account-balance RPC. */
export class BalanceStore {
  /** Observable state consumed by the sidebar footer. */
  readonly store: SnapshotStore<BalanceState> = createSnapshotStore<BalanceState>({
    status: 'loading', isAvailable: false, balances: [], error: null,
  })

  private generation = 0

  constructor(private readonly remote: Pick<ClientRemote, 'llm'>) {}

  /** Refresh from the currently configured official DeepSeek credential. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    try {
      const response = await this.remote.llm.accountBalance(DEEPSEEK_OFFICIAL_PROVIDER)
      if (!response.ok) throw new Error(response.error.message)
      const value = response.value
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'ready'
        state.isAvailable = value.isAvailable
        state.balances = value.balances
        state.error = null
      })
    } catch (error: unknown) {
      if (generation !== this.generation) return
      this.store.update((state) => {
        state.status = 'error'
        state.error = error instanceof Error ? error.message : String(error)
      })
    }
  }
}
