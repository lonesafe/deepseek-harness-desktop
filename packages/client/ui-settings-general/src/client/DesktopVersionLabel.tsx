import { useMemo } from 'react'
import { desktopUpdateConfiguration } from './desktop-update.ts'
import css from './SettingsRoot.module.css'

/** Current version beside Settings, visible only in the trusted desktop renderer. */
export function DesktopVersionLabel({ wide }: { wide: boolean }) {
  const configuration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  if (!wide || configuration === undefined) return null
  return (
    <span className={css.desktopVersion} title={`DeepSeek Harness ${configuration.version}`}>
      v{configuration.version}
    </span>
  )
}
