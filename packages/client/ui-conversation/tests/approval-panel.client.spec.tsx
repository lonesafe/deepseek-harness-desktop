// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ClientResponse, RpcReceipt } from '@deepseek-ai/dsh-api-remotes/client'
import { RpcId } from '@deepseek-ai/dsh-client-connection/client'
import { PendingWait, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ApprovalComposerProps } from '../src/client/contract/slots.ts'
import { ApprovalPanel } from '../src/client/skeleton/ApprovalPanel.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const SID = 'approval-session' as SessionId
const t = makeTranslate(zh)

function props(allowAlways: boolean, respond: (message: ClientResponse) => Promise<RpcReceipt>): ApprovalComposerProps {
  const matched = new PendingWait(
    'approval', RpcId('approval-rpc'), SID,
    { approvalId: 'approval-id' as never, toolName: 'bash', reason: '需要操作本机文件', allowAlways },
    respond,
  )
  const useSession: ApprovalComposerProps['useSession'] = selector => selector({} as never)
  return {
    interactions: [], session: undefined, matched, sessionId: SID, useSession,
    useSessions: () => { throw new Error('unused') },
    useWorkspaces: () => { throw new Error('unused') },
    useProjection: () => undefined,
    useInput: () => { throw new Error('unused') },
    inputActions: { setDraft: () => { throw new Error('unused') }, submit: () => { throw new Error('unused') } } as never,
    t,
  }
}

describe('ApprovalPanel remembered grants', () => {
  it('offers Always allow and sends the remembered outcome when the Host advertises it', async () => {
    const respond = vi.fn(async (_message: ClientResponse): Promise<RpcReceipt> => ({ accepted: true }))
    const view = render(<ApprovalPanel {...props(true, respond)} />)

    expect(view.getByRole('button', { name: '拒绝' })).toBeTruthy()
    expect(view.getByRole('button', { name: '允许一次' })).toBeTruthy()
    fireEvent.click(view.getByRole('button', { name: '总是允许' }))

    await waitFor(() => { expect(respond).toHaveBeenCalledTimes(1) })
    expect(respond.mock.calls[0]?.[0]).toMatchObject({
      type: 'client-response',
      result: { ok: true, value: { sessionId: SID, approvalId: 'approval-id', outcome: 'allowed-always' } },
    })
  })

  it('keeps the two original actions when the request cannot be remembered', async () => {
    const respond = vi.fn(async (_message: ClientResponse): Promise<RpcReceipt> => ({ accepted: true }))
    const view = render(<ApprovalPanel {...props(false, respond)} />)

    expect(view.queryByRole('button', { name: '总是允许' })).toBeNull()
    fireEvent.click(view.getByRole('button', { name: '允许一次' }))

    await waitFor(() => { expect(respond).toHaveBeenCalledTimes(1) })
    expect(respond.mock.calls[0]?.[0]).toMatchObject({
      result: { ok: true, value: { outcome: 'allowed-once' } },
    })
  })
})
