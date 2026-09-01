/**
 * Renderless lifecycle for an asynchronous string picker. Each rising `open` edge starts one pick;
 * rerenders keep that request armed, a closed state rearms it, and unmount discards its settlement.
 * @module @deepseek-ai/dsh-client-ui-primitives/AsyncPickerFlow
 */

import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'

/** Inputs and outcome callbacks for {@link AsyncPickerFlow}. */
export interface AsyncPickerFlowProps {
  /** Whether the owner currently requests a pick. */
  readonly open: boolean
  /** Start one picker operation, returning `null` when the user cancels it. */
  readonly pick: () => Promise<string | null>
  /** Receive a selected string. */
  readonly onPicked: (value: string) => void
  /** Receive a user cancellation. */
  readonly onCancel: () => void
  /** Receive a normalized picker failure message. */
  readonly onError: (message: string) => void
}

/**
 * Run one renderless picker operation per rising `open` edge.
 * @param props - picker state and the latest outcome callbacks.
 * @returns nothing; the picker owns its external presentation.
 */
export function AsyncPickerFlow(props: AsyncPickerFlowProps): ReactElement | null {
  const { open, pick } = props
  const armed = useRef(false)
  const outcome = useRef(props)
  outcome.current = props
  const alive = useRef(true)
  useEffect(() => {
    // StrictMode replays setup and cleanup before the live development lifetime.
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    if (!open) {
      armed.current = false
      return
    }
    if (armed.current) return
    armed.current = true
    pick().then(
      (value) => {
        if (!alive.current) return
        if (value === null) outcome.current.onCancel(); else outcome.current.onPicked(value)
      },
      (reason: unknown) => {
        if (!alive.current) return
        outcome.current.onError(reason instanceof Error ? reason.message : String(reason))
      },
    )
  }, [open, pick])
  return null
}
