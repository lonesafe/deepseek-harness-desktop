/**
 * Browser-safe request, result, and state-stream vocabulary for the Workspace
 * and directory-picking Remote namespaces this package owns. The picking seam
 * declares its own listing types, so they are re-exported here rather than
 * restated: a browser consumer reads the very declaration the backend answers.
 */

import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

export type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
export type { DirectoryEntry, DirectoryListing } from '@deepseek-ai/dsh-host-directory-picker/types'

/** One durable Workspace projected for browser consumers. */
export interface WorkspaceView {
  readonly workspaceId: WorkspaceId
  /** Canonical host directory path. */
  readonly path: string
  /** User-visible title. */
  readonly title: string
  /** Sessions accounted to this Workspace in manual order. */
  readonly sessionIds: readonly SessionId[]
  /** ISO-8601 creation instant. */
  readonly createdAt: string
  /** ISO-8601 last-mutation instant. */
  readonly updatedAt: string
}

/** One direct child in a read-only Workspace directory listing. */
export interface WorkspaceFileEntry {
  readonly name: string
  /** Portable Workspace-relative path using `/` separators. */
  readonly path: string
  readonly kind: 'directory' | 'file'
  readonly hidden: boolean
  /** File bytes, or zero for a directory. */
  readonly size: number
  /** ISO-8601 modification instant. */
  readonly modifiedAt: string
}

/** One bounded directory level inside a registered Workspace. */
export interface WorkspaceFileListing {
  /** Portable Workspace-relative directory path; empty selects the root. */
  readonly path: string
  readonly entries: readonly WorkspaceFileEntry[]
  /** Whether the Host stopped at its entry bound. */
  readonly truncated: boolean
}

/** Bounded read-only content used by browser preview and download surfaces. */
export interface WorkspaceFilePreview {
  readonly path: string
  readonly name: string
  readonly mime: string
  readonly size: number
  readonly modifiedAt: string
  readonly kind: 'markdown' | 'text' | 'image' | 'pdf' | 'binary' | 'unsupported'
  readonly encoding: 'utf8' | 'base64' | 'none'
  readonly content: string
  /** Present when content is intentionally omitted. */
  readonly reason?: 'too-large'
}

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested directory cannot back a Workspace. */
    'workspace/invalid-path': { readonly path: string }
    /** Another Workspace already uses the requested name. */
    'workspace/name-conflict': { readonly name: string }
    /** The Session or its anchor is not in the Workspace's manual order. */
    'workspace/move-invalid': {
      readonly workspaceId: WorkspaceId
      readonly sessionId: SessionId
      readonly beforeSessionId?: SessionId
    }
    /** The verb needs an interaction the composed backend does not serve. */
    'directory-picker/unavailable': { readonly capability: string }
    /** The target is not fully qualified, or the backend cannot list it. */
    'directory-picker/unreadable': { readonly path: string }
    /** A child of that name is already there. */
    'directory-picker/exists': { readonly path: string }
    /** The parent is not fully qualified, the name is not one segment, or creation failed. */
    'directory-picker/create-failed': { readonly path: string }
    /** The portable path is invalid or resolves outside its registered Workspace. */
    'workspace/file-invalid-path': { readonly workspaceId: WorkspaceId; readonly path: string }
    /** The registered Workspace path cannot be listed or read. */
    'workspace/file-unreadable': { readonly workspaceId: WorkspaceId; readonly path: string }
    /** The preview target is not a regular file. */
    'workspace/file-not-file': { readonly workspaceId: WorkspaceId; readonly path: string }
  }
}

/** Existing directory requested for Workspace adoption. */
export interface WorkspaceCreateRequest {
  readonly path: string
}

/** Created or previously registered Workspace. */
export interface WorkspaceCreateValue {
  readonly workspace: WorkspaceView
  readonly created: boolean
}

/** Workspace title mutation. */
export interface WorkspaceRenameRequest {
  readonly workspaceId: WorkspaceId
  readonly title: string
}

/** Workspace mutation returning the complete changed row. */
export interface WorkspaceValue {
  readonly workspace: WorkspaceView
}

/** Workspace registration deletion. */
export interface WorkspaceDeleteRequest {
  readonly workspaceId: WorkspaceId
}

/** Read-only directory listing request inside one registered Workspace. */
export interface WorkspaceListFilesRequest {
  readonly workspaceId: WorkspaceId
  /** Portable relative directory path; absent selects the Workspace root. */
  readonly path?: string
}

/** Bounded file preview request inside one registered Workspace. */
export interface WorkspaceReadFileRequest {
  readonly workspaceId: WorkspaceId
  /** Portable non-empty relative file path. */
  readonly path: string
}

/** Receipt after one Workspace registration is deleted. */
export interface WorkspaceDeleteValue {
  readonly deleted: true
}

/** DOM-insertBefore-like Workspace order mutation. */
export interface WorkspaceInsertBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly beforeWorkspaceId?: WorkspaceId
}

/** Complete Workspace registry order after a mutation. */
export interface WorkspaceOrderValue {
  readonly workspaceIds: readonly WorkspaceId[]
}

/** DOM-insertBefore-like Session membership order mutation. */
export interface WorkspaceInsertSessionBeforeRequest {
  readonly workspaceId: WorkspaceId
  readonly sessionId: SessionId
  readonly beforeSessionId?: SessionId
}

/** Session requested for archival from Workspace grouping surfaces. */
export interface WorkspaceArchiveSessionRequest {
  readonly sessionId: SessionId
}

/** Complete archived Session set after a mutation. */
export interface WorkspaceArchiveValue {
  readonly archivedSessionIds: readonly SessionId[]
}

/** Complete reconnect baseline for Workspace browser state. */
export interface WorkspaceBaseline {
  readonly items: readonly WorkspaceView[]
  readonly archivedSessionIds: readonly SessionId[]
}

/** One ordered Workspace change after a generation's baseline. */
export type WorkspaceFollowIncrement =
  | { readonly type: 'upsert'; readonly workspace: WorkspaceView }
  | { readonly type: 'remove'; readonly workspaceId: WorkspaceId }
  | { readonly type: 'order'; readonly workspaceIds: readonly WorkspaceId[] }
  | { readonly type: 'archived'; readonly archivedSessionIds: readonly SessionId[] }

/** Workspace state stream; every generation starts with exactly one baseline. */
export type WorkspaceFollowFrame =
  | { readonly type: 'baseline'; readonly value: WorkspaceBaseline }
  | WorkspaceFollowIncrement
