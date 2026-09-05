import { useEffect, useMemo, useState } from 'react'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_SNAPSHOT_KEY, DESKTOP_UPDATE_STATE_EVENT,
  desktopUpdateConfiguration, desktopUpdateDownloadState, desktopUpdateSnapshot,
  type DesktopUpdateDownloadState,
} from './desktop-update.ts'
import css from './DesktopUpdateBadge.module.css'
import type { SettingsRootComponentProps } from './shell-contract.ts'

/** Desktop-only update affordance next to the sidebar Settings trigger. */
export function DesktopUpdateBadge({ wide, t }: { wide: boolean; t: SettingsRootComponentProps['t'] }) {
  const initialSnapshot = useMemo(() => desktopUpdateSnapshot(
    (window as unknown as Record<string, unknown>)[DESKTOP_UPDATE_SNAPSHOT_KEY],
  ), [])
  const searchConfiguration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  const [snapshot, setSnapshot] = useState(initialSnapshot)
  const configuration = searchConfiguration ?? snapshot?.configuration
  const [updateState, setUpdateState] = useState<DesktopUpdateDownloadState>(initialSnapshot?.update ?? { status: 'idle' })

  useEffect(() => {
    const readSnapshot = () => desktopUpdateSnapshot(
      (window as unknown as Record<string, unknown>)[DESKTOP_UPDATE_SNAPSHOT_KEY],
    )
    const onState = (event: Event) => {
      const retained = readSnapshot()
      if (retained !== undefined) setSnapshot(retained)
      const next = desktopUpdateDownloadState((event as CustomEvent<unknown>).detail)
      if (next !== undefined) setUpdateState(next)
    }
    window.addEventListener(DESKTOP_UPDATE_STATE_EVENT, onState)
    const retained = readSnapshot()
    if (retained !== undefined) {
      setSnapshot(retained)
      setUpdateState(retained.update)
    }
    return () => { window.removeEventListener(DESKTOP_UPDATE_STATE_EVENT, onState) }
  }, [])

  if (configuration === undefined) return null
  const available = updateState.status === 'available' ? updateState : undefined
  const active = updateState.status !== 'idle' && updateState.status !== 'available'
  if (available === undefined && !active) return null
  const transfer = (updateState.status === 'downloading' || updateState.status === 'verifying'
    || (updateState.status === 'cancelling' && 'version' in updateState)) ? updateState : undefined
  const progress = transfer === undefined ? 0 : Math.round((transfer.received / transfer.total) * 100)
  const status = updateState.status === 'checking'
    ? t('update.checking')
    : updateState.status === 'verifying'
      ? t('update.verifying')
      : updateState.status === 'cancelling'
        ? t('update.cancelling')
        : t('update.downloading')
  return (
    <>
      {available !== undefined && (
        <a
          className={wide ? css.badge : css.railBadge}
          href="dsh-update://download"
          target="_blank"
          rel="noopener noreferrer"
          title={t('update.downloadTitle', { version: available.version, fileName: available.fileName })}
          aria-label={t('update.available', { version: available.version })}
        >
          <span aria-hidden="true">↓</span>{wide && t('update.action')}
        </a>
      )}
      {active && (
        <section className={css.progressCard} role="status" aria-live="polite">
          <div className={css.progressHeader}>
            <div className={css.progressCopy}>
              <strong>{status}</strong>
              {transfer !== undefined && <span>{t('update.productVersion', { version: transfer.version })}</span>}
            </div>
            <a
              className={css.cancelButton}
              href={DESKTOP_UPDATE_CANCEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('update.cancel')}
              title={t('update.cancelTitle')}
            >
              <span aria-hidden="true">×</span>
            </a>
          </div>
          {transfer !== undefined && (
            <>
              <div className={css.progressMeta}>
                <span>{formatBytes(transfer.received, t)} / {formatBytes(transfer.total, t)}</span>
                <span>{progress}%</span>
              </div>
              <div
                className={css.progressTrack}
                role="progressbar"
                aria-label={t('update.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <span className={css.progressValue} style={{ width: `${progress}%` }} />
              </div>
            </>
          )}
        </section>
      )}
    </>
  )
}

/** Compact byte totals for the desktop update progress card. */
function formatBytes(bytes: number, t: SettingsRootComponentProps['t']): string {
  if (bytes < 1024) return t('update.bytes', { value: bytes })
  if (bytes < 1024 * 1024) return t('update.kibibytes', { value: (bytes / 1024).toFixed(1) })
  return t('update.mebibytes', { value: (bytes / 1024 / 1024).toFixed(1) })
}
