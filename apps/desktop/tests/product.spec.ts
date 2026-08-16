import { describe, expect, it } from 'vitest'
import { desktopWindowTitle } from '../src/product.ts'

describe('desktop product title', () => {
  it('includes the running version', () => {
    expect(desktopWindowTitle('1.0.0-beta.8')).toBe('DeepSeek Harness 1.0.0-beta.8')
  })
})
