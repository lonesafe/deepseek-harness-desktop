/**
 * Built-bundle imports use plain Node, with native type stripping for the
 * erasable TypeScript runner. Vitest's module runner accepts CSS, while tsx
 * redirects workspace imports to source through tsconfig paths; neither
 * measures the installed artifact graph.
 *
 * The corpus is the build output, so this skips on a tree that has none.
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { expect, test, TestRunner } from 'vitest'

const runner = fileURLToPath(new URL('./transform-corpus-check.ts', import.meta.url))

test('every built bundle imports under Node', (context) => {
  const finished = spawnSync(process.execPath, [runner], {
    encoding: 'utf8', timeout: TestRunner.getCurrentTest()!.timeout,
  })
  const output = `${finished.stdout}${finished.stderr}`
  expect(finished.error).toBeUndefined()
  expect(finished.signal).toBeNull()
  if (output.includes('no built bundles found')) {
    context.skip('the workspace has no build output to sweep')
    return
  }
  // The runner prefixes every finding with '- ', so a failure reads as the
  // findings themselves rather than as a diff of its whole report.
  expect(output.split('\n').filter(line => line.startsWith('- ')).join('\n')).toBe('')
  expect(finished.status, output).toBe(0)
}, 900_000)

// The hook replaces only the chosen bundle; shared build artifacts stay intact.
test.each([
  ['expected-css', 0, 'baselineExempt=1 unexpectedBaselineFailure=0'],
  ['dependency-css', 0, 'baselineExempt=1 unexpectedBaselineFailure=0'],
  ['error', 1, '- UNEXPECTED BASELINE FAILURE'],
  ['other-css', 1, '- UNEXPECTED BASELINE FAILURE'],
  ['source-css', 1, '- UNEXPECTED BASELINE FAILURE'],
  ['other-code', 1, '- UNEXPECTED BASELINE FAILURE'],
  ['clean', 1, '- STALE EXEMPTION'],
] as const)('classifies dockkit import: %s', (mode, status, finding) => {
  const root = new URL('../../../../../', import.meta.url)
  const bundle = 'packages/client/ui-dockkit/lib/index.js'
  const stylesheet = mode === 'dependency-css'
    ? 'packages/client/ui-primitives/lib/StateDot.module.css'
    : mode === 'source-css'
      ? 'packages/client/ui-primitives/src/StateDot.module.css'
      : 'packages/client/ui-dockkit/lib/components/dockkit.module.css'
  const css = fileURLToPath(new URL(stylesheet, root))
  const message = mode === 'error'
    ? 'dockkit-negative-control'
    : `Unknown file extension ".css" for ${mode === 'other-css' ? `${css}.other.css` : css}`
  const source = mode === 'clean'
    ? 'export {}'
    : `throw Object.assign(new Error(${JSON.stringify(message)}), { code: ${JSON.stringify(mode === 'other-code' ? 'ERR_OTHER' : 'ERR_UNKNOWN_FILE_EXTENSION')} })`
  const script = `
    import { registerHooks } from 'node:module'
    const target = ${JSON.stringify(new URL(bundle, root).href)}
    registerHooks({
      resolve(specifier, context, nextResolve) {
        if (specifier === target) return { url: target, shortCircuit: true }
        return nextResolve(specifier, context)
      },
      load(url, context, nextLoad) {
        if (url === target) {
          return { format: 'module', shortCircuit: true, source: ${JSON.stringify(source)} }
        }
        return nextLoad(url, context)
      },
    })
    process.argv = [process.execPath, 'corpus-classification', ${JSON.stringify(bundle)}]
    await import(${JSON.stringify(pathToFileURL(runner).href)})
  `
  const finished = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: fileURLToPath(root), encoding: 'utf8', timeout: TestRunner.getCurrentTest()!.timeout,
  })
  const output = `${finished.stdout}${finished.stderr}`
  expect(finished.error).toBeUndefined()
  expect(finished.signal).toBeNull()
  expect(finished.status, output).toBe(status)
  expect(output).toContain(finding)
  if (mode === 'error' || mode === 'other-css' || mode === 'source-css' || mode === 'other-code') {
    expect(output).toContain(`- UNEXPECTED BASELINE FAILURE ${bundle}: ${message}\n`)
  }
})
