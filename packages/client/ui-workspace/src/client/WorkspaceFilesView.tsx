import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  IconChevronLeftOutline14, IconChevronRightOutline14, IconDownloadOutline16,
  IconFolderClose16, IconRefreshOutline14, MarkdownText,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  WorkspaceFileEntry, WorkspaceFileListing, WorkspaceFilePreview,
} from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { WorkspaceFilesProps } from './contract/slots.ts'
import css from './WorkspaceFilesView.module.css'

function formatBytes(bytes: number, t: WorkspaceFilesProps['t']): string {
  if (bytes < 1_024) return t('files.size.bytes', { value: bytes })
  if (bytes < 1_048_576) return t('files.size.kib', { value: (bytes / 1_024).toFixed(bytes < 10_240 ? 1 : 0) })
  return t('files.size.mib', { value: (bytes / 1_048_576).toFixed(bytes < 10_485_760 ? 1 : 0) })
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function dataHref(preview: WorkspaceFilePreview): string | undefined {
  if (preview.encoding === 'base64') return `data:${preview.mime};base64,${preview.content}`
  if (preview.encoding === 'utf8') {
    return `data:${preview.mime};charset=utf-8,${encodeURIComponent(preview.content)}`
  }
  return undefined
}

function FilePreview({ preview, t }: Pick<WorkspaceFilesProps, 't'> & { preview: WorkspaceFilePreview }) {
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'source'>('preview')
  useEffect(() => { setMarkdownMode('preview') }, [preview.path])
  const href = dataHref(preview)
  let body
  if (preview.kind === 'markdown') {
    body = markdownMode === 'preview'
      ? <div className={css.markdown}><MarkdownText text={preview.content} labels={{
        code: { copyLabel: t('files.copy'), copiedLabel: t('files.copied') },
        footnotes: t('files.footnotes'),
      }} /></div>
      : <pre className={css.textPreview}>{preview.content}</pre>
  } else if (preview.kind === 'text') {
    body = <pre className={css.textPreview}>{preview.content}</pre>
  } else if (preview.kind === 'image' && href !== undefined) {
    body = <div className={css.imageStage}><img src={href} alt={preview.name} /></div>
  } else if (preview.kind === 'pdf' && href !== undefined) {
    body = <object className={css.pdfPreview} data={href} type={preview.mime} aria-label={preview.name} />
  } else {
    body = (
      <p className={css.emptyCopy}>
        {preview.reason === 'too-large' ? t('files.tooLarge') : t('files.unsupported')}
      </p>
    )
  }
  return (
    <>
      <div className={css.previewHeader}>
        <div className={css.previewIdentity}>
          <strong title={preview.path}>{preview.name}</strong>
          <span>{formatBytes(preview.size, t)}</span>
        </div>
        <div className={css.previewActions}>
          {preview.kind === 'markdown' && (
            <div className={css.viewSwitch} role="group" aria-label={t('files.markdownMode')}>
              <button type="button" aria-pressed={markdownMode === 'preview'} onClick={() => { setMarkdownMode('preview') }}>
                {t('files.rendered')}
              </button>
              <button type="button" aria-pressed={markdownMode === 'source'} onClick={() => { setMarkdownMode('source') }}>
                {t('files.source')}
              </button>
            </div>
          )}
          {href !== undefined && (
            <a className={css.download} href={href} download={preview.name}>
              <IconDownloadOutline16 />
              <span>{t('files.download')}</span>
            </a>
          )}
        </div>
      </div>
      <div className={css.previewBody}>{body}</div>
    </>
  )
}

/** Read-only file browser and bounded preview for the current Session Workspace. */
export function WorkspaceFilesView({
  sessionId, useWorkspaces, listFiles, readFile, t,
}: WorkspaceFilesProps) {
  const workspace = useWorkspaces(state => state.items.find(item => item.sessionIds.includes(sessionId)))
  const [path, setPath] = useState('')
  const [listing, setListing] = useState<WorkspaceFileListing | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [listPending, setListPending] = useState(false)
  const [showHidden, setShowHidden] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [preview, setPreview] = useState<WorkspaceFilePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewPending, setPreviewPending] = useState(false)
  const previewController = useRef<AbortController | null>(null)

  useEffect(() => {
    setPath('')
    setSelectedPath(null)
    setPreview(null)
    setPreviewError(null)
  }, [workspace?.workspaceId])

  useEffect(() => {
    if (workspace === undefined) {
      setListing(null)
      setListPending(false)
      return
    }
    const controller = new AbortController()
    setListPending(true)
    setListError(null)
    void listFiles(workspace.workspaceId, path, controller.signal).then(
      (value) => { setListing(value); setListPending(false) },
      (reason: unknown) => {
        if (controller.signal.aborted) return
        setListing(null)
        setListError(errorMessage(reason))
        setListPending(false)
      },
    )
    return () => { controller.abort() }
  }, [listFiles, path, refresh, workspace])

  useEffect(() => () => { previewController.current?.abort() }, [])

  const entries = useMemo(
    () => listing?.entries.filter(entry => showHidden || !entry.hidden) ?? [],
    [listing, showHidden],
  )
  const segments = path === '' ? [] : path.split('/')

  const changeDirectory = useCallback((nextPath: string) => {
    previewController.current?.abort()
    setPath(nextPath)
    setSelectedPath(null)
    setPreview(null)
    setPreviewError(null)
  }, [])

  const openFile = useCallback((entry: WorkspaceFileEntry) => {
    if (workspace === undefined) return
    previewController.current?.abort()
    const controller = new AbortController()
    previewController.current = controller
    setSelectedPath(entry.path)
    setPreview(null)
    setPreviewError(null)
    setPreviewPending(true)
    void readFile(workspace.workspaceId, entry.path, controller.signal).then(
      (value) => { setPreview(value); setPreviewPending(false) },
      (reason: unknown) => {
        if (controller.signal.aborted) return
        setPreviewError(errorMessage(reason))
        setPreviewPending(false)
      },
    )
  }, [readFile, workspace])

  if (workspace === undefined) {
    return (
      <div className={css.root} data-conversation-composer-overlay="" data-workspace-files-view="">
        <div className={css.unavailable}>
          <h2>{t('files.title')}</h2>
          <p>{t('files.emptyWorkspace')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={css.root} data-conversation-composer-overlay="" data-workspace-files-view="" data-preview-open={selectedPath !== null ? '' : undefined}>
      <section className={css.browser} aria-label={t('files.title')}>
        <div className={css.toolbar}>
          <div>
            <h2>{t('files.title')}</h2>
            <span>{workspace.title}</span>
          </div>
          <div className={css.toolbarActions}>
            <button type="button" onClick={() => { setShowHidden(value => !value) }}>
              {showHidden ? t('files.hideHidden') : t('files.showHidden')}
            </button>
            <button type="button" className={css.iconButton} aria-label={t('files.refresh')} onClick={() => { setRefresh(value => value + 1) }}>
              <IconRefreshOutline14 />
            </button>
          </div>
        </div>
        <nav className={css.breadcrumbs} aria-label={t('files.root')}>
          <button type="button" aria-current={path === '' ? 'page' : undefined} onClick={() => { changeDirectory('') }}>
            {t('files.root')}
          </button>
          {segments.map((segment, index) => {
            const segmentPath = segments.slice(0, index + 1).join('/')
            return (
              <span key={segmentPath}>
                <IconChevronRightOutline14 />
                <button type="button" aria-current={index === segments.length - 1 ? 'page' : undefined} onClick={() => { changeDirectory(segmentPath) }}>
                  {segment}
                </button>
              </span>
            )
          })}
        </nav>
        <div className={css.fileList} aria-live="polite">
          {listPending && <p className={css.emptyCopy}>{t('files.loading')}</p>}
          {listError !== null && <p className={css.error}>{t('files.error', { message: listError })}</p>}
          {!listPending && listError === null && entries.length === 0 && <p className={css.emptyCopy}>{t('files.empty')}</p>}
          {entries.map(entry => (
            <button
              type="button"
              key={entry.path}
              className={css.fileRow}
              data-selected={entry.path === selectedPath ? '' : undefined}
              onClick={() => {
                if (entry.kind === 'directory') changeDirectory(entry.path)
                else openFile(entry)
              }}
            >
              <span className={css.fileIcon} aria-hidden="true">
                {entry.kind === 'directory' ? <IconFolderClose16 /> : entry.name.split('.').at(-1)?.slice(0, 4).toUpperCase() || t('files.fileFallback')}
              </span>
              <span className={css.fileName}>{entry.name}</span>
              <span className={css.fileSize}>{entry.kind === 'file' ? formatBytes(entry.size, t) : ''}</span>
              {entry.kind === 'directory' && <IconChevronRightOutline14 />}
            </button>
          ))}
          {listing?.truncated === true && <p className={css.notice}>{t('files.truncated')}</p>}
        </div>
      </section>
      <section className={css.preview} aria-label={t('files.preview')}>
        {selectedPath !== null && (
          <button type="button" className={css.mobileBack} onClick={() => { setSelectedPath(null); setPreview(null); setPreviewError(null) }}>
            <IconChevronLeftOutline14 />
            <span>{t('files.back')}</span>
          </button>
        )}
        {previewPending && <p className={css.emptyCopy}>{t('files.loading')}</p>}
        {previewError !== null && <p className={css.error}>{t('files.error', { message: previewError })}</p>}
        {!previewPending && previewError === null && preview === null && <p className={css.emptyCopy}>{t('files.noSelection')}</p>}
        {preview !== null && <FilePreview preview={preview} t={t} />}
      </section>
    </div>
  )
}
