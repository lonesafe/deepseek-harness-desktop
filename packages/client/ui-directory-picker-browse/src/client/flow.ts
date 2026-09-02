/**
 * The browse picking occupant (package-internal; the `./client` surface
 * exposes only the Loader exports). Same-package tests exercise it directly
 * through this module.
 */
import { createElement, useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { DirectoryListing } from '@deepseek-ai/dsh-api-remotes/client'
import type { Translate } from '@deepseek-ai/dsh-client-locale/client'
// Type-only: the owner contract of the directory-flow holes.
import type { DirectoryFlowOwnerProps } from '@deepseek-ai/dsh-client-ui-workspace/client'
import { DirectoryBrowser } from './DirectoryBrowser.tsx'

/** Injected face: the browse wire calls and copy the dialog drives (bound in apply's closure). */
export interface BrowseFlowInjected {
  /** List one directory level (absent path = the Host home directory); the signal aborts a superseded scan. */
  listDirectory: (path?: string, signal?: AbortSignal) => Promise<DirectoryListing>
  /** Create one child directory under an existing parent. */
  createDirectory: (path: string, name: string) => Promise<string>
  /** Ask the desktop Host to open its native chooser. */
  pick: () => Promise<string | null>
  /** Whether the current browser page itself is loopback. */
  isLoopback: boolean
  /** Prefer the native chooser only for a loopback page of an adaptive desktop host. */
  nativeOnLoopback: boolean
  /** Localized dialog copy (this package's namespace). */
  t: Translate
}

/**
 * Flow occupant: adapts the hole's owner conversation onto the browser
 * dialog — a confirmed directory is the picked path, dismissal is the
 * cancellation. Browse failures (unreadable targets, create conflicts) stay
 * inside the dialog's own alert surfaces, so the owner's `onError` arm is
 * never driven by this occupant.
 * @param props - owner conversation plus the injected browse face.
 * @returns the dialog element (renders nothing while closed).
 */
export function BrowseDirectoryFlow(props: DirectoryFlowOwnerProps & BrowseFlowInjected): ReactElement {
  if (props.nativeOnLoopback && props.isLoopback) return createElement(LoopbackNativeDirectoryFlow, props)
  return createElement(DirectoryBrowser, {
    open: props.open,
    busy: props.busy,
    listDirectory: props.listDirectory,
    createDirectory: props.createDirectory,
    t: props.t,
    onOpen: props.onPicked,
    onClose: props.onCancel,
  })
}

/** Renderless local arm of the adaptive picker; remote pages always use the browser dialog. */
function LoopbackNativeDirectoryFlow(props: DirectoryFlowOwnerProps & BrowseFlowInjected): ReactElement | null {
  const { open, pick } = props
  const requestOpen = useRef(false)
  const handlers = useRef(props)
  handlers.current = props
  const generation = useRef(0)
  useEffect(() => {
    return () => { generation.current += 1 }
  }, [])
  useEffect(() => {
    if (!open) {
      requestOpen.current = false
      return
    }
    if (requestOpen.current) return
    requestOpen.current = true
    const requestGeneration = generation.current
    void runNativePick(pick).then((result) => {
      if (requestGeneration !== generation.current) return
      if (result.ok) {
        if (result.path === null) handlers.current.onCancel()
        else handlers.current.onPicked(result.path)
        return
      }
      handlers.current.onError(result.message)
    })
  }, [open, pick])
  return null
}

type NativePickResult =
  | { readonly ok: true; readonly path: string | null }
  | { readonly ok: false; readonly message: string }

async function runNativePick(pick: () => Promise<string | null>): Promise<NativePickResult> {
  try {
    return { ok: true, path: await pick() }
  } catch (reason: unknown) {
    return { ok: false, message: reason instanceof Error ? reason.message : String(reason) }
  }
}
