/** Bounded, read-only filesystem projection for registered Workspaces. */

import { opendir, open, realpath, stat } from 'node:fs/promises'
import { extname, isAbsolute, join, relative, sep } from 'node:path'
import type {
  WorkspaceFileEntry, WorkspaceFileListing, WorkspaceFilePreview,
} from './types.ts'

/** Maximum rows returned by one directory listing. */
export const WORKSPACE_FILE_ENTRY_LIMIT = 1_000
/** Maximum bytes returned by one preview or download payload. */
export const WORKSPACE_FILE_PREVIEW_MAX_BYTES = 8 << 20

/** Stable business failure reported by workspace file RPC methods. */
export class WorkspaceFileError extends Error {
  constructor(
    readonly code: 'workspace-file-invalid-path' | 'workspace-file-unreadable' | 'workspace-file-not-file',
    message: string,
  ) {
    super(message)
    this.name = 'WorkspaceFileError'
  }
}

const IMAGE_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

const TEXT_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.bash': 'text/x-shellscript',
  '.c': 'text/x-c',
  '.cc': 'text/x-c++',
  '.conf': 'text/plain',
  '.cpp': 'text/x-c++',
  '.cs': 'text/x-csharp',
  '.css': 'text/css',
  '.csv': 'text/csv',
  '.env': 'text/plain',
  '.go': 'text/x-go',
  '.gql': 'text/plain',
  '.graphql': 'text/plain',
  '.h': 'text/x-c',
  '.hpp': 'text/x-c++',
  '.htm': 'text/html',
  '.html': 'text/html',
  '.ini': 'text/plain',
  '.java': 'text/x-java',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.jsonc': 'application/json',
  '.jsx': 'text/javascript',
  '.kt': 'text/x-kotlin',
  '.kts': 'text/x-kotlin',
  '.less': 'text/css',
  '.log': 'text/plain',
  '.lua': 'text/x-lua',
  '.markdown': 'text/markdown',
  '.md': 'text/markdown',
  '.mdx': 'text/markdown',
  '.mjs': 'text/javascript',
  '.py': 'text/x-python',
  '.rb': 'text/x-ruby',
  '.rs': 'text/x-rust',
  '.scss': 'text/css',
  '.sh': 'text/x-shellscript',
  '.sql': 'text/x-sql',
  '.svg': 'image/svg+xml',
  '.swift': 'text/x-swift',
  '.toml': 'application/toml',
  '.ts': 'text/typescript',
  '.tsv': 'text/tab-separated-values',
  '.tsx': 'text/typescript',
  '.txt': 'text/plain',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.zsh': 'text/x-shellscript',
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx'])
const TEXT_FILENAMES = new Set([
  '.editorconfig', '.env', '.gitattributes', '.gitignore', '.npmrc', '.prettierignore',
  'dockerfile', 'license', 'makefile', 'readme',
])

function relativeSegments(path: string): string[] {
  if (path === '') return []
  if (path.includes('\0') || path.includes('\\') || path.startsWith('/')) {
    throw new WorkspaceFileError('workspace-file-invalid-path', 'Workspace file paths must be portable relative paths.')
  }
  const segments = path.split('/')
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) {
    throw new WorkspaceFileError('workspace-file-invalid-path', 'Workspace file paths cannot contain empty, dot, or parent segments.')
  }
  return segments
}

function within(root: string, target: string): boolean {
  const suffix = relative(root, target)
  return suffix === '' || (!isAbsolute(suffix) && suffix !== '..' && !suffix.startsWith(`..${sep}`))
}

async function resolveInside(root: string, path: string): Promise<string> {
  const candidate = join(root, ...relativeSegments(path))
  try {
    const resolved = await realpath(candidate)
    if (!within(root, resolved)) {
      throw new WorkspaceFileError('workspace-file-invalid-path', 'Workspace file path resolves outside the Workspace.')
    }
    return resolved
  } catch (error: unknown) {
    if (error instanceof WorkspaceFileError) throw error
    throw new WorkspaceFileError(
      'workspace-file-unreadable',
      `Workspace file path is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function resolveRoot(workspaceRoot: string): Promise<string> {
  try {
    return await realpath(workspaceRoot)
  } catch (error: unknown) {
    throw new WorkspaceFileError(
      'workspace-file-unreadable',
      `Workspace root is unavailable: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function childPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`
}

/**
 * List one Workspace-relative directory without exposing Host absolute paths.
 * @param workspaceRoot Canonical root owned by the registered Workspace.
 * @param path Portable Workspace-relative directory path; empty selects the root.
 * @param signal Caller cancellation for directory iteration.
 * @returns The bounded direct-child listing and truncation state.
 */
export async function listWorkspaceFiles(
  workspaceRoot: string,
  path: string,
  signal: AbortSignal,
): Promise<WorkspaceFileListing> {
  const root = await resolveRoot(workspaceRoot)
  const directory = await resolveInside(root, path)
  let info
  try {
    info = await stat(directory)
  } catch (error: unknown) {
    throw new WorkspaceFileError(
      'workspace-file-unreadable',
      `Workspace directory cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!info.isDirectory()) {
    throw new WorkspaceFileError('workspace-file-unreadable', 'Workspace file listing target is not a directory.')
  }
  const entries: WorkspaceFileEntry[] = []
  let truncated = false
  try {
    const handle = await opendir(directory)
    for await (const entry of handle) {
      signal.throwIfAborted()
      if (entries.length === WORKSPACE_FILE_ENTRY_LIMIT) {
        truncated = true
        break
      }
      if (!entry.isDirectory() && !entry.isFile() && !entry.isSymbolicLink()) continue
      const absolute = join(directory, entry.name)
      let resolved: string
      let childInfo
      try {
        resolved = entry.isSymbolicLink() ? await realpath(absolute) : absolute
        if (!within(root, resolved)) continue
        childInfo = await stat(resolved)
      } catch {
        continue
      }
      if (!childInfo.isDirectory() && !childInfo.isFile()) continue
      entries.push({
        name: entry.name,
        path: childPath(path, entry.name),
        kind: childInfo.isDirectory() ? 'directory' : 'file',
        hidden: entry.name.startsWith('.'),
        size: childInfo.isFile() ? childInfo.size : 0,
        modifiedAt: childInfo.mtime.toISOString(),
      })
    }
  } catch (error: unknown) {
    if (signal.aborted) signal.throwIfAborted()
    throw new WorkspaceFileError(
      'workspace-file-unreadable',
      `Workspace directory cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  entries.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1
    return left.name.localeCompare(right.name)
  })
  return { path, entries, truncated }
}

function mimeFor(path: string): string {
  const extension = extname(path).toLowerCase()
  return IMAGE_MIME_BY_EXTENSION[extension]
    ?? TEXT_MIME_BY_EXTENSION[extension]
    ?? (extension === '.pdf' ? 'application/pdf' : 'application/octet-stream')
}

function textKind(path: string): 'markdown' | 'text' | undefined {
  const extension = extname(path).toLowerCase()
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown'
  if (TEXT_MIME_BY_EXTENSION[extension] !== undefined || TEXT_FILENAMES.has(path.split('/').at(-1)?.toLowerCase() ?? '')) {
    return 'text'
  }
  return undefined
}

function decodedText(data: Buffer): string | undefined {
  if (data.includes(0)) return undefined
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data)
  } catch {
    return undefined
  }
}

/**
 * Read one bounded Workspace-relative regular file for preview or download.
 * @param workspaceRoot Canonical root owned by the registered Workspace.
 * @param path Portable Workspace-relative file path.
 * @param signal Caller cancellation checked before the response is projected.
 * @returns A typed preview containing bounded text or Base64 content.
 */
export async function readWorkspaceFile(
  workspaceRoot: string,
  path: string,
  signal: AbortSignal,
): Promise<WorkspaceFilePreview> {
  if (path === '') {
    throw new WorkspaceFileError('workspace-file-invalid-path', 'Workspace file preview requires a file path.')
  }
  const root = await resolveRoot(workspaceRoot)
  const target = await resolveInside(root, path)
  let handle
  try {
    handle = await open(target, 'r')
  } catch (error: unknown) {
    throw new WorkspaceFileError(
      'workspace-file-unreadable',
      `Workspace file cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  try {
    const info = await handle.stat()
    if (!info.isFile()) {
      throw new WorkspaceFileError('workspace-file-not-file', 'Workspace file preview target is not a regular file.')
    }
    const common = {
      path,
      name: path.split('/').at(-1) ?? path,
      mime: mimeFor(path),
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
    }
    if (info.size > WORKSPACE_FILE_PREVIEW_MAX_BYTES) {
      return { ...common, kind: 'unsupported', encoding: 'none', content: '', reason: 'too-large' }
    }
    const data = await handle.readFile()
    signal.throwIfAborted()
    if (data.byteLength > WORKSPACE_FILE_PREVIEW_MAX_BYTES) {
      return { ...common, size: data.byteLength, kind: 'unsupported', encoding: 'none', content: '', reason: 'too-large' }
    }
    const declaredText = textKind(path)
    const text = decodedText(data)
    if (declaredText !== undefined && text !== undefined) {
      return { ...common, kind: declaredText, encoding: 'utf8', content: text }
    }
    if (IMAGE_MIME_BY_EXTENSION[extname(path).toLowerCase()] !== undefined) {
      return { ...common, kind: 'image', encoding: 'base64', content: data.toString('base64') }
    }
    if (extname(path).toLowerCase() === '.pdf') {
      return { ...common, kind: 'pdf', encoding: 'base64', content: data.toString('base64') }
    }
    if (text !== undefined) {
      return { ...common, mime: 'text/plain', kind: 'text', encoding: 'utf8', content: text }
    }
    return { ...common, kind: 'binary', encoding: 'base64', content: data.toString('base64') }
  } finally {
    await handle.close()
  }
}
