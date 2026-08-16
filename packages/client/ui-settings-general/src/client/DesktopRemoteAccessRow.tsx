/** Desktop-only General Settings entry for account-based remote control. */

import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { isDesktopRenderer } from './desktop-update.ts'
import css from './DesktopRemoteAccessRow.module.css'

const REMOTE_ACCESS_ACTION_URL = 'dsh-remote://manage'

/** Runtime and localized copy received from the General Settings item slot. */
export type DesktopRemoteAccessRowProps =
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'>

/** Render the desktop remote-control management entry; ordinary web clients render nothing. */
export function DesktopRemoteAccessRow({ t }: DesktopRemoteAccessRowProps) {
  if (!isDesktopRenderer(window.location.search)) return null
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('remote.title')}</div>
        <div className={css.desc}>{t('remote.description')}</div>
      </div>
      <a
        className={css.action}
        href={REMOTE_ACCESS_ACTION_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('remote.manage')}
      </a>
    </div>
  )
}
