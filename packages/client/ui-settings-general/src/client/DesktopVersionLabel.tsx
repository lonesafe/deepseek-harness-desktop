import { useEffect, useMemo, useState } from 'react'
import {
  DESKTOP_UPDATE_SNAPSHOT_KEY, DESKTOP_UPDATE_STATE_EVENT,
  desktopUpdateConfiguration, desktopUpdateSnapshot,
} from './desktop-update.ts'
import css from './SettingsRoot.module.css'
import type { SettingsRootComponentProps } from './shell-contract.ts'

/** Current version beside Settings, visible only in the trusted desktop renderer. */
export function DesktopVersionLabel({ wide, t }: { wide: boolean; t: SettingsRootComponentProps['t'] }) {
  const searchConfiguration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  const [snapshotConfiguration, setSnapshotConfiguration] = useState(() => desktopUpdateSnapshot(
    (window as unknown as Record<string, unknown>)[DESKTOP_UPDATE_SNAPSHOT_KEY],
  )?.configuration)
  useEffect(() => {
    const refresh = () => {
      const snapshot = desktopUpdateSnapshot(
        (window as unknown as Record<string, unknown>)[DESKTOP_UPDATE_SNAPSHOT_KEY],
      )
      if (snapshot !== undefined) setSnapshotConfiguration(snapshot.configuration)
    }
    window.addEventListener(DESKTOP_UPDATE_STATE_EVENT, refresh)
    refresh()
    return () => { window.removeEventListener(DESKTOP_UPDATE_STATE_EVENT, refresh) }
  }, [])
  const configuration = searchConfiguration ?? snapshotConfiguration
  if (!wide || configuration === undefined) return null
  return (
    <span className={css.desktopVersion} title={t('version.title', { version: configuration.version })}>
      {t('version.value', { version: configuration.version })}
    </span>
  )
}
