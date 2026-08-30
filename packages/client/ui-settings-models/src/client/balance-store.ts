/** DeepSeek account-balance state shared by the desktop and remote settings footer. */

import type { LlmBalanceInfo } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ModelsLlm } from './store.ts'

/** Official DeepSeek route whose configured credential owns the balance. */
export const DEEPSEEK_OFFICIAL_PROVIDER = 'deepseek-official'

/** Settings-footer balance snapshot. */
export interface BalanceState {
  status: 'loading' | 'ready' | 'error'
  isAvailable: boolean
  balances: readonly LlmBalanceInfo[]
  error: string | null
}

/** Latest-wins controller for the read-only balance RPC. */
export class BalanceStore {
  /** Observable balance state consumed by the settings-footer indicator. */
  readonly store: SnapshotStore<BalanceState> = createSnapshotStore<BalanceState>({
    status: 'loading', isAvailable: false, balances: [], error: null,
  })

  private generation = 0

  constructor(private readonly llm: Pick<ModelsLlm, 'balance'>) {}

  /** Refresh from the currently configured official DeepSeek credential. */
  async load(): Promise<void> {
    const generation = ++this.generation
    this.store.update((state) => {
      state.status = 'loading'
      state.error = null
    })
    try {
      const response = await this.llm.balance(DEEPSEEK_OFFICIAL_PROVIDER)
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
