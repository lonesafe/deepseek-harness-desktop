/** Compact DeepSeek account balance displayed immediately before the version. */

import type { SettingsRootComponentProps } from './shell-contract.ts'
import type { BalanceState } from './balance-store.ts'
import css from './BalanceIndicator.module.css'

function amountLabel(currency: string, amount: string): string {
  if (currency === 'CNY') return `¥${amount}`
  if (currency === 'USD') return `$${amount}`
  return `${amount} ${currency}`
}

function detail(state: BalanceState, t: SettingsRootComponentProps['t']): string {
  if (state.status === 'loading') return t('balance.loading')
  if (state.status === 'error') return t('balance.error', { message: state.error ?? '' })
  const rows = state.balances.map(row => t('balance.detail', {
    currency: row.currency,
    total: row.totalBalance,
    toppedUp: row.toppedUpBalance,
    granted: row.grantedBalance,
  })).join('\n')
  if (rows.length === 0) return state.isAvailable ? t('balance.unavailable') : t('balance.accountUnavailable')
  return state.isAvailable ? rows : `${t('balance.accountUnavailable')}\n${rows}`
}

/** Clickable balance label; clicking performs an explicit refresh. */
export function BalanceIndicator({
  wide, useBalance, refreshBalance, t,
}: Pick<SettingsRootComponentProps, 'wide' | 'useBalance' | 'refreshBalance' | 't'>) {
  const state = useBalance(value => value)
  if (!wide) return null
  const value = state.status === 'ready' && state.balances.length > 0
    ? state.balances.map(row => amountLabel(row.currency, row.totalBalance)).join(' / ')
    : state.status === 'loading'
      ? '…'
      : '--'
  return (
    <button
      type="button"
      className={css.balance}
      title={detail(state, t)}
      aria-label={t('balance.label', { value })}
      onClick={refreshBalance}
    >
      <span className={css.label}>{t('balance.title')}</span>
      <span className={css.value}>{value}</span>
    </button>
  )
}
