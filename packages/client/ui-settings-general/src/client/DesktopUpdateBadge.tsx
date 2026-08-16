import { useEffect, useMemo, useRef, useState } from 'react'
import {
  desktopUpdateConfiguration, fetchDesktopUpdate, UPDATE_CHECK_INTERVAL_MS,
  type DesktopUpdate,
} from './desktop-update.ts'
import css from './DesktopUpdateBadge.module.css'

/** Desktop-only update affordance next to the sidebar Settings trigger. */
export function DesktopUpdateBadge({ wide }: { wide: boolean }) {
  const configuration = useMemo(() => desktopUpdateConfiguration(window.location.search), [])
  const [update, setUpdate] = useState<DesktopUpdate | undefined>()
  const inFlight = useRef<AbortController | undefined>()

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
  return (
    <a
      className={wide ? css.badge : css.railBadge}
      href="dsh-update://download"
      target="_blank"
      rel="noopener noreferrer"
      title={`下载 DeepSeek Harness ${update.version}（${update.fileName}）`}
      aria-label={`有新版本 ${update.version}，从官网下载`}
    >
      <span aria-hidden="true">↓</span>{wide && '更新'}
    </a>
  )
}
