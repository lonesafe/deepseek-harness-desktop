import { describe, expect, it, vi } from 'vitest'
import { offerStartupAccountAuthorization } from '../src/startup-account-onboarding.ts'

describe('desktop startup account onboarding', () => {
  it('starts immediately when the device already has an account authorization', async () => {
    const prompt = vi.fn<() => Promise<'authorize' | 'skip'>>()
    const authorize = vi.fn<() => Promise<void>>()
    await offerStartupAccountAuthorization({
      hasAuthorization: () => true,
      prompt,
      authorize,
    })
    expect(prompt).not.toHaveBeenCalled()
    expect(authorize).not.toHaveBeenCalled()
  })

  it('starts browser authorization when the user chooses login or registration', async () => {
    const authorize = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    await offerStartupAccountAuthorization({
      hasAuthorization: () => false,
      prompt: async () => 'authorize',
      authorize,
    })
    expect(authorize).toHaveBeenCalledOnce()
  })

  it('allows local-only use when the user skips account onboarding', async () => {
    const authorize = vi.fn<() => Promise<void>>()
    await offerStartupAccountAuthorization({
      hasAuthorization: () => false,
      prompt: async () => 'skip',
      authorize,
    })
    expect(authorize).not.toHaveBeenCalled()
  })
})
