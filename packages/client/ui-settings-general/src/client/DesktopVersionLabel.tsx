import { useMemo } from 'react'
import { desktopUpdateConfiguration } from './desktop-update.ts'
import type { SettingsRootComponentProps } from './shell-contract.ts'
import css from './SettingsRoot.module.css'

/** Current version beside Settings, visible only in the trusted desktop renderer. */
export function DesktopVersionLabel({ wide, t }: { wide: boolean } & Pick<SettingsRootComponentProps, 't'>) {
  const configuration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  if (!wide || configuration === undefined) return null
  return (
    <span className={css.desktopVersion} title={t('update.productVersion', { version: configuration.version })}>
      {t('version.label', { version: configuration.version })}
    </span>
  )
}
