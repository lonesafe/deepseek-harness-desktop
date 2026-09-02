import { useMemo } from 'react'
import { desktopUpdateConfiguration } from './desktop-update.ts'
import css from './SettingsRoot.module.css'
import type { SettingsRootComponentProps } from './shell-contract.ts'

/** Current version beside Settings, visible only in the trusted desktop renderer. */
export function DesktopVersionLabel({ wide, t }: { wide: boolean; t: SettingsRootComponentProps['t'] }) {
  const configuration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  if (!wide || configuration === undefined) return null
  return (
    <span className={css.desktopVersion} title={t('version.title', { version: configuration.version })}>
      {t('version.value', { version: configuration.version })}
    </span>
  )
}
