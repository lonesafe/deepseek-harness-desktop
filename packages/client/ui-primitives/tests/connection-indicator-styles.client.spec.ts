import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(
  fileURLToPath(new URL('../src/ConnectionIndicator.module.css', import.meta.url)),
  'utf8',
)

describe('ConnectionIndicator styles', () => {
  it('suppresses animated attempt dots while the action label is visible', () => {
    expect(css).toMatch(
      /\.warning:is\(:hover, :focus-visible\) \.stateLabel \.dots span\s*\{[^}]*visibility:\s*hidden;[^}]*animation:\s*none;/,
    )
  })
})
