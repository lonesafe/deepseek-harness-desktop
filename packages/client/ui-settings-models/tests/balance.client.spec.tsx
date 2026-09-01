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

  it('formats USD and other currencies and explains account availability', () => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update((state) => {
      state.status = 'ready'
      state.isAvailable = false
      state.balances = [
        { currency: 'USD', totalBalance: '2.50', grantedBalance: '0.50', toppedUpBalance: '2.00' },
        { currency: 'EUR', totalBalance: '3.00', grantedBalance: '1.00', toppedUpBalance: '2.00' },
      ]
    })
    renderBalance(store)
    const button = screen.getByRole('button', { name: /\$2\.50 \/ 3\.00 EUR/u })
    expect(button.title).toContain(en.balanceAccountUnavailable)
  })

  it.each([
    ['loading', false, '…', en.balanceLoading],
    ['ready', true, '--', en.balanceUnavailable],
    ['ready', false, '--', en.balanceAccountUnavailable],
    ['error', false, '--', `${en.balanceUnavailable}: `],
  ] as const)('renders %s state without rows', (status, isAvailable, value, title) => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update((state) => {
      state.status = status
      state.isAvailable = isAvailable
      state.balances = []
      state.error = null
    })
    renderBalance(store)
    const button = screen.getByRole('button')
    expect(button.textContent).toContain(value)
    expect(button.title).toBe(title)
  })
})

describe('BalanceStore', () => {
  it('loads the official provider and maps Remote and non-Error failures', async () => {
    const balance = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: { message: 'credential missing' } })
      .mockRejectedValueOnce('wire closed')
      .mockResolvedValueOnce({
        ok: true,
        value: {
          isAvailable: true,
          balances: [{ currency: 'USD', totalBalance: '1', grantedBalance: '0', toppedUpBalance: '1' }],
        },
      })
    const store = new BalanceStore({ balance })

    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'credential missing' })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: 'wire closed' })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready', isAvailable: true, balances: [{ currency: 'USD' }], error: null,
    })
    expect(balance).toHaveBeenNthCalledWith(1, 'deepseek-official')
  })

  it('keeps the newest load result when older success and failure settle later', async () => {
    const first = Promise.withResolvers<never>()
    const second = Promise.withResolvers<{ ok: true; value: { isAvailable: boolean; balances: never[] } }>()
    const balance = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
    const store = new BalanceStore({ balance })
    const old = store.load()
    const fresh = store.load()
    second.resolve({ ok: true, value: { isAvailable: false, balances: [] } })
    await fresh
    first.reject(new Error('stale failure'))
    await old
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', isAvailable: false, error: null })

    const oldSuccess = Promise.withResolvers<{ ok: true; value: { isAvailable: boolean; balances: never[] } }>()
    const newest = Promise.withResolvers<{ ok: true; value: { isAvailable: boolean; balances: never[] } }>()
    balance.mockImplementationOnce(() => oldSuccess.promise).mockImplementationOnce(() => newest.promise)
    const stale = store.load()
    const latest = store.load()
    newest.resolve({ ok: true, value: { isAvailable: true, balances: [] } })
    await latest
    oldSuccess.resolve({ ok: true, value: { isAvailable: false, balances: [] } })
    await stale
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', isAvailable: true })
  })
})
