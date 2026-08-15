import { describe, expect, it } from 'vitest'
import { isAppNavigation, isSafeExternalUrl } from '../src/security.ts'

describe('desktop navigation policy', () => {
  it('keeps only the exact managed origin in the app window', () => {
    const origin = 'http://127.0.0.1:43119'
    expect(isAppNavigation(`${origin}/settings`, origin)).toBe(true)
    expect(isAppNavigation('http://127.0.0.1:43120/', origin)).toBe(false)
    expect(isAppNavigation('http://127.0.0.1:43119.attacker.example/', origin)).toBe(false)
    expect(isAppNavigation('not a url', origin)).toBe(false)
  })

  it('hands only credential-free HTTPS URLs to the operating system', () => {
    expect(isSafeExternalUrl('https://github.com/deepseek-ai/deepseek-harness')).toBe(true)
    expect(isSafeExternalUrl('https://user:secret@example.com/')).toBe(false)
    expect(isSafeExternalUrl('http://example.com/')).toBe(false)
    expect(isSafeExternalUrl('file:///tmp/payload')).toBe(false)
  })
})
