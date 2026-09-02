// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { BalanceIndicator } from '../src/client/BalanceIndicator.tsx'
import { BalanceStore, type BalanceState } from '../src/client/balance-store.ts'
import { en } from '../src/client/locales.ts'
import type { SettingsRootComponentProps } from '../src/client/shell-contract.ts'

afterEach(cleanup)

describe('DeepSeek balance footer', () => {
  it('loads exact decimal balances through the generated Remote method', async () => {
    const accountBalance = vi.fn().mockResolvedValue({ ok: true, value: {
      isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.34', toppedUpBalance: '10.00' }],
    } })
    const controller = new BalanceStore({ llm: { accountBalance } } as unknown as Pick<ClientRemote, 'llm'>)
    await controller.load()
    expect(accountBalance).toHaveBeenCalledWith('deepseek-official')
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready', isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '12.34' }],
    })
  })

  it('renders immediately before the version as a refreshable Chinese label', () => {
    const state: BalanceState = {
      status: 'ready', isAvailable: true,
      balances: [{ currency: 'CNY', totalBalance: '12.34', grantedBalance: '2.34', toppedUpBalance: '10.00' }],
      error: null,
    }
    const useBalance: SettingsRootComponentProps['useBalance'] = selector => selector(state)
    const refreshBalance = vi.fn()
    render(<BalanceIndicator
      wide
      useBalance={useBalance}
      refreshBalance={refreshBalance}
      t={makeTranslate(en)}
    />)
    const button = screen.getByRole('button', { name: /Balance: ¥12\.34/u })
    fireEvent.click(button)
    expect(refreshBalance).toHaveBeenCalledOnce()
  })
})
