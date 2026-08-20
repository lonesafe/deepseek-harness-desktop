// @vitest-environment jsdom
/** Desktop/remote settings-footer balance presentation. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { BalanceIndicator } from '../src/client/BalanceIndicator.tsx'
import type { BalanceIndicatorProps } from '../src/client/BalanceIndicator.tsx'
import { BalanceStore } from '../src/client/balance-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const t = (key: keyof typeof en): string => en[key]

function renderBalance(store: BalanceStore, refresh = vi.fn()) {
  render(<BalanceIndicator {...({
    wide: true, useBalance: bindSnapshotSelector(store.store), refresh, t,
  } as unknown as BalanceIndicatorProps)} />)
  return refresh
}

describe('BalanceIndicator', () => {
  it('shows the exact CNY total and exposes its breakdown', () => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update((state) => {
      state.status = 'ready'
      state.isAvailable = true
      state.balances = [{
        currency: 'CNY', totalBalance: '12.3400', grantedBalance: '2.3400', toppedUpBalance: '10.0000',
      }]
    })
    renderBalance(store)
    const button = screen.getByRole('button', { name: /Balance: ¥12\.3400/ })
    expect(button.textContent).toBe('Balance¥12.3400')
    expect(button.getAttribute('title')).toContain('topped up 10.0000')
  })

  it('shows an unavailable fallback and refreshes on click', () => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update((state) => {
      state.status = 'error'
      state.error = 'API key missing'
    })
    const refresh = renderBalance(store)
    const button = screen.getByRole('button', { name: /Balance: --/ })
    expect(button.getAttribute('title')).toContain('API key missing')
    fireEvent.click(button)
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('stays out of the collapsed sidebar rail', () => {
    const store = new BalanceStore({ llm: {} } as never)
    render(<BalanceIndicator {...({
      wide: false, useBalance: bindSnapshotSelector(store.store), refresh: vi.fn(), t,
    } as unknown as BalanceIndicatorProps)} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
