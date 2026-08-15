/**
 * workspace domain zod schemas (names derived from map keys). The
 * WorkspaceId brand cast lives in sessions.schema (see the note there) and
 * is re-exported here as the domain-local name.
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import type { WorkspaceView } from './workspace.ts'
import { sessionIdSchema, workspaceIdSchema } from './sessions.schema.ts'

export { workspaceIdSchema } from './sessions.schema.ts'

/** WorkspaceView row of every workspace.* response. */
export const workspaceViewSchema = z.object({
  workspaceId: workspaceIdSchema,
  path: z.string(),
  title: z.string(),
  sessionIds: z.array(sessionIdSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<Wire<WorkspaceView>>

/** workspace.list request payload (empty object literal). */
export const workspaceListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'workspace.list'>>>

/** workspace.list response value. */
export const workspaceListValueSchema = z.object({
  items: z.array(workspaceViewSchema),
  archivedSessionIds: z.array(sessionIdSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.list'>>>

const workspaceRelativePathSchema = z.string().max(4_096).refine(
  path => !path.includes('\0') && !path.includes('\\') && !path.startsWith('/')
    && (path === '' || path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')),
  { message: 'Workspace file paths must be portable relative paths without dot segments' },
)

/** workspace.listFiles request payload. */
export const workspaceListFilesRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  path: workspaceRelativePathSchema.optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.listFiles'>>>

/** workspace.listFiles response value. */
export const workspaceListFilesValueSchema = z.object({
  path: workspaceRelativePathSchema,
  entries: z.array(z.object({
    name: z.string(),
    path: workspaceRelativePathSchema,
    kind: z.enum(['directory', 'file']),
    hidden: z.boolean(),
    size: z.number().int().nonnegative(),
    modifiedAt: z.string(),
  })),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.listFiles'>>>

/** workspace.readFile request payload. */
export const workspaceReadFileRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  path: workspaceRelativePathSchema.refine(path => path !== '', {
    message: 'workspace.readFile requires a non-empty path',
  }),
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.readFile'>>>

/** workspace.readFile response value. */
export const workspaceReadFileValueSchema = z.object({
  path: workspaceRelativePathSchema,
  name: z.string(),
  mime: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: z.string(),
  kind: z.enum(['markdown', 'text', 'image', 'pdf', 'binary', 'unsupported']),
  encoding: z.enum(['utf8', 'base64', 'none']),
  content: z.string(),
  reason: z.literal('too-large').optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.readFile'>>>

/** workspace.create request payload: the existing directory to adopt. */
export const workspaceCreateRequestSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.create'>>>

/** workspace.create response value. */
export const workspaceCreateValueSchema = z.object({
  workspace: workspaceViewSchema,
  created: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.create'>>>

/** workspace.rename request payload: the new title must be non-blank. */
export const workspaceRenameRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  title: z.string(),
}).refine(
  payload => payload.title.trim() !== '',
  { message: 'workspace.rename requires a non-blank title' },
) satisfies z.ZodType<Wire<RequestPayload<'workspace.rename'>>>

/** workspace.rename response value. */
export const workspaceRenameValueSchema = z.object({
  workspace: workspaceViewSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.rename'>>>

/** workspace.delete request payload. */
export const workspaceDeleteRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.delete'>>>

/** workspace.delete response value. */
export const workspaceDeleteValueSchema = z.object({
  deleted: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.delete'>>>

/** workspace.insertBefore request payload (anchor omitted = append to end). */
export const workspaceInsertBeforeRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  beforeWorkspaceId: workspaceIdSchema.optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.insertBefore'>>>

/** workspace.insertBefore response value: the complete durable display order. */
export const workspaceInsertBeforeValueSchema = z.object({
  workspaceIds: z.array(workspaceIdSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.insertBefore'>>>

/** workspace.insertSessionBefore request payload (anchor omitted = append to end). */
export const workspaceInsertSessionBeforeRequestSchema = z.object({
  workspaceId: workspaceIdSchema,
  sessionId: sessionIdSchema,
  beforeSessionId: sessionIdSchema.optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.insertSessionBefore'>>>

/** workspace.insertSessionBefore response value. */
export const workspaceInsertSessionBeforeValueSchema = z.object({
  workspace: workspaceViewSchema,
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.insertSessionBefore'>>>

/** workspace.archiveSession request payload. */
export const workspaceArchiveSessionRequestSchema = z.object({
  sessionId: sessionIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'workspace.archiveSession'>>>

/** workspace.archiveSession response value: the full updated archive set. */
export const workspaceArchiveSessionValueSchema = z.object({
  archivedSessionIds: z.array(sessionIdSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'workspace.archiveSession'>>>
