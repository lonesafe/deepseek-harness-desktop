import { useEffect, useMemo, useRef, useState } from 'react'
import {
  DESKTOP_UPDATE_CANCEL_URL, DESKTOP_UPDATE_STATE_EVENT, desktopUpdateConfiguration,
  desktopUpdateDownloadState, fetchDesktopUpdate, UPDATE_CHECK_INTERVAL_MS,
  type DesktopUpdate, type DesktopUpdateDownloadState,
} from './desktop-update.ts'
import type { SettingsRootComponentProps } from './shell-contract.ts'
import css from './DesktopUpdateBadge.module.css'

/** Desktop-only update affordance next to the sidebar Settings trigger. */
export function DesktopUpdateBadge({ wide, t }: { wide: boolean } & Pick<SettingsRootComponentProps, 't'>) {
  const configuration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  const [update, setUpdate] = useState<DesktopUpdate | undefined>()
  const [download, setDownload] = useState<DesktopUpdateDownloadState>({ status: 'idle' })
  const inFlight = useRef<AbortController | undefined>()

  useEffect(() => {
    if (configuration === undefined) return
    const onState = (event: Event) => {
      const next = desktopUpdateDownloadState((event as CustomEvent<unknown>).detail)
      if (next !== undefined) setDownload(next)
    }
    window.addEventListener(DESKTOP_UPDATE_STATE_EVENT, onState)
    return () => { window.removeEventListener(DESKTOP_UPDATE_STATE_EVENT, onState) }
  }, [configuration])

  useEffect(() => {
    if (configuration === undefined) return
    let disposed = false
    const check = async () => {
      if (inFlight.current !== undefined) return
      const controller = new AbortController()
      inFlight.current = controller
      try {
        const next = await fetchDesktopUpdate(configuration, controller.signal)
        if (!disposed) setUpdate(next)
      } catch {
        // Update checks are background work; transient portal failures do not interrupt the user.
      } finally {
        if (inFlight.current === controller) inFlight.current = undefined
      }
    }
    void check()
    const interval = window.setInterval(() => { void check() }, UPDATE_CHECK_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(interval)
      inFlight.current?.abort()
      inFlight.current = undefined
    }
  }, [configuration])

  if (update === undefined) return null
  const active = download.status !== 'idle'
  const transfer = 'version' in download ? download : undefined
  const progress = transfer === undefined ? 0 : Math.round((transfer.received / transfer.total) * 100)
  const status = download.status === 'checking'
    ? t('update.status.checking')
    : download.status === 'verifying'
      ? t('update.status.verifying')
      : download.status === 'cancelling'
        ? t('update.status.cancelling')
        : t('update.status.downloading')
  return (
    <>
      <a
        className={wide ? css.badge : css.railBadge}
        href="dsh-update://download"
        target="_blank"
        rel="noopener noreferrer"
        title={t('update.download.title', { version: update.version, fileName: update.fileName })}
        aria-label={t('update.available', { version: update.version })}
      >
        <span aria-hidden="true">↓</span>{wide && t('update.label')}
      </a>
      {active && (
        <section className={css.progressCard} role="status" aria-live="polite">
          <div className={css.progressHeader}>
            <div className={css.progressCopy}>
              <strong>{status}</strong>
              <span>{t('update.productVersion', { version: transfer?.version ?? update.version })}</span>
            </div>
            <a
              className={css.cancelButton}
              href={DESKTOP_UPDATE_CANCEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('update.cancel.aria')}
              title={t('update.cancel')}
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
  if (bytes < 1024) return t('update.size.bytes', { value: bytes })
  if (bytes < 1024 * 1024) return t('update.size.kib', { value: (bytes / 1024).toFixed(1) })
  return t('update.size.mib', { value: (bytes / 1024 / 1024).toFixed(1) })
}
