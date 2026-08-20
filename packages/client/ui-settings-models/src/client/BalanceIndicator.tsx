/** Compact account-balance utility beside Settings in desktop and remote UI. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { BalanceState } from './balance-store.ts'
import css from './BalanceIndicator.module.css'

/** Plugin-owned dependencies injected into the settings-footer contribution. */
export interface BalanceIndicatorInjected {
  hooks: { balance: SnapshotStore<BalanceState> }
  refresh: () => void
}

/** Full props for the balance utility beside the Settings trigger. */
export type BalanceIndicatorProps = PropsRuntime<'settings.footer.utility'>
  & PropsLocale<'settings.models'>
  & InjectFace<BalanceIndicatorInjected>

function amountLabel(currency: string, amount: string): string {
  if (currency === 'CNY') return `¥${amount}`
  if (currency === 'USD') return `$${amount}`
  return `${amount} ${currency}`
}

/** Readable balance tooltip with total/funded/granted detail. */
function detail(state: BalanceState, t: BalanceIndicatorProps['t']): string {
  if (state.status === 'loading') return t('balanceLoading')
  if (state.status === 'error') return `${t('balanceUnavailable')}: ${state.error ?? ''}`
  const rows = state.balances.map(row => [
    `${row.currency}: ${t('balanceTotal')} ${row.totalBalance}`,
    `${t('balanceToppedUp')} ${row.toppedUpBalance}`,
    `${t('balanceGranted')} ${row.grantedBalance}`,
  ].join(' · ')).join('\n')
  if (rows.length === 0) return state.isAvailable ? t('balanceUnavailable') : t('balanceAccountUnavailable')
  return state.isAvailable ? rows : `${t('balanceAccountUnavailable')}\n${rows}`
}

/** Settings-row balance label; clicking it performs an explicit refresh. */
export function BalanceIndicator({ wide, useBalance, refresh, t }: BalanceIndicatorProps) {
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
      aria-label={`${t('balance')}: ${value}. ${t('balanceRefresh')}`}
      onClick={refresh}
    >
      <span className={css.label}>{t('balance')}</span>
      <span className={css.value}>{value}</span>
    </button>
  )
}
