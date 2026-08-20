// @vitest-environment jsdom
/** Desktop/remote session-header balance presentation. */

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
    useBalance: bindSnapshotSelector(store.store), refresh, t,
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

  it.each([
    {
      name: 'loading',
      state: { status: 'loading' as const, isAvailable: false, balances: [], error: null },
      value: '…',
      title: en.balanceLoading,
    },
    {
      name: 'available account without rows',
      state: { status: 'ready' as const, isAvailable: true, balances: [], error: null },
      value: '--',
      title: en.balanceUnavailable,
    },
    {
      name: 'unavailable account without rows',
      state: { status: 'ready' as const, isAvailable: false, balances: [], error: null },
      value: '--',
      title: en.balanceAccountUnavailable,
    },
    {
      name: 'error without provider detail',
      state: { status: 'error' as const, isAvailable: false, balances: [], error: null },
      value: '--',
      title: `${en.balanceUnavailable}: `,
    },
  ])('renders the $name state', ({ state, value, title }) => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update(snapshot => Object.assign(snapshot, state))
    renderBalance(store)
    expect(screen.getByRole('button').textContent).toBe(`Balance${value}`)
    expect(screen.getByRole('button').getAttribute('title')).toBe(title)
  })

  it('formats USD and fallback currencies and prefixes unavailable account detail', () => {
    const store = new BalanceStore({ llm: {} } as never)
    store.store.update((state) => {
      state.status = 'ready'
      state.isAvailable = false
      state.balances = [
        { currency: 'USD', totalBalance: '3.20', grantedBalance: '1.20', toppedUpBalance: '2.00' },
        { currency: 'EUR', totalBalance: '4.00', grantedBalance: '0.00', toppedUpBalance: '4.00' },
      ]
    })
    renderBalance(store)
    const button = screen.getByRole('button')
    expect(button.textContent).toBe('Balance$3.20 / 4.00 EUR')
    expect(button.getAttribute('title')).toBe(
      `${en.balanceAccountUnavailable}\nUSD: total 3.20 · topped up 2.00 · granted 1.20\n`
      + 'EUR: total 4.00 · topped up 4.00 · granted 0.00',
    )
  })
})

describe('BalanceStore', () => {
  it('loads and detaches a successful provider response', async () => {
    const balances = [{
      currency: 'CNY', totalBalance: '8.00', grantedBalance: '3.00', toppedUpBalance: '5.00',
    }]
    const balance = vi.fn().mockResolvedValue({
      result: { ok: true, value: { isAvailable: true, balances } },
    })
    const store = new BalanceStore({ llm: { balance } } as never)
    await store.load()
    expect(balance).toHaveBeenCalledWith({ provider: 'deepseek-official' })
    expect(store.store.getSnapshot()).toEqual({
      status: 'ready', isAvailable: true, balances, error: null,
    })
  })

  it.each([
    {
      name: 'typed RPC failure',
      balance: vi.fn().mockResolvedValue({ result: { ok: false, error: { message: 'denied' } } }),
      message: 'denied',
    },
    {
      name: 'thrown Error',
      balance: vi.fn().mockRejectedValue(new Error('offline')),
      message: 'offline',
    },
    {
      name: 'non-Error rejection',
      balance: vi.fn().mockRejectedValue('closed'),
      message: 'closed',
    },
  ])('reports a $name', async ({ balance, message }) => {
    const store = new BalanceStore({ llm: { balance } } as never)
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'error', error: message })
  })

  it('ignores both successful and failed responses from superseded loads', async () => {
    let resolveFirst!: (value: unknown) => void
    let rejectThird!: (reason: unknown) => void
    const first = new Promise((resolve) => { resolveFirst = resolve })
    const third = new Promise((_resolve, reject) => { rejectThird = reject })
    const balance = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ result: { ok: true, value: { isAvailable: false, balances: [] } } })
      .mockReturnValueOnce(third)
      .mockResolvedValueOnce({ result: { ok: true, value: { isAvailable: true, balances: [] } } })
    const store = new BalanceStore({ llm: { balance } } as never)

    const staleSuccess = store.load()
    await store.load()
    resolveFirst({ result: { ok: true, value: { isAvailable: true, balances: [] } } })
    await staleSuccess
    expect(store.store.getSnapshot().isAvailable).toBe(false)

    const staleFailure = store.load()
    await store.load()
    rejectThird(new Error('stale failure'))
    await staleFailure
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', isAvailable: true, error: null })
  })
})
