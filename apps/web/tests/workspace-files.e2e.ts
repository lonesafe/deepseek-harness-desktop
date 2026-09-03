// Real assembled Web regression for the read-only Workspace file manager.
// It crosses the HTTP RPC boundary into the Host filesystem projection, then
// verifies Markdown/image rendering and the mobile single-column geometry.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

describe('web e2e: Workspace files and previews', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const root = join(scaffold.workspaceCwd, 'workspace')
    await mkdir(join(root, 'docs'), { recursive: true })
    await writeFile(join(root, 'README.md'), '# Workspace Preview\n\nRemote-safe Markdown.')
    await writeFile(join(root, 'docs', 'notes.txt'), 'nested text')
    await writeFile(join(root, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB', 'base64'))
    await writeFile(join(root, '.hidden'), 'hidden')

    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    // A freshly connected Session stays in its composer hero until its first
    // durable message. Append a closed local turn through the real Session
    // spine so the ordinary Session header appears without needing a model.
    const agent = scaffold.ctx.agents.list()[0]
    if (agent === undefined) throw new Error('connected Workspace created no Agent')
    agent.session.append('turn/start', { turn: 1 })
    agent.session.append('user/message', createUserMessage({
      content: [{ type: 'text', text: 'Inspect project files.' }],
      source: { kind: 'user' },
    }), { surfaceOp: 'append' })
    agent.session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    await page.getByRole('tab', { name: 'Files', exact: true }).waitFor({ timeout: 15_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('browses real Workspace files and renders bounded previews', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-files'))
    await page.getByRole('tab', { name: 'Files', exact: true }).click()
    const view = page.locator('[data-workspace-files-view]')
    await view.waitFor({ timeout: 10_000 })
    await view.getByRole('button', { name: /README\.md/ }).click()
    await view.getByRole('heading', { name: 'Workspace Preview' }).waitFor({ timeout: 10_000 })
    expect(await view.getByText('Remote-safe Markdown.').count()).toBe(1)
    expect(await view.getByRole('link', { name: 'Download file' }).getAttribute('download')).toBe('README.md')

    await view.getByRole('button', { name: 'Source', exact: true }).click()
    await view.getByText('# Workspace Preview', { exact: false }).waitFor({ timeout: 10_000 })
    expect(await view.getByRole('heading', { name: 'Workspace Preview' }).count()).toBe(0)
    await view.getByRole('button', { name: 'Preview', exact: true }).click()
    await view.getByRole('heading', { name: 'Workspace Preview' }).waitFor({ timeout: 10_000 })

    await view.getByRole('button', { name: 'docs', exact: true }).click()
    await view.getByRole('button', { name: /notes\.txt/ }).waitFor({ timeout: 10_000 })
    await view.getByRole('button', { name: 'Root', exact: true }).click()
    await view.getByRole('button', { name: /pixel\.png/ }).click()
    await view.locator('img[alt="pixel.png"]').waitFor({ timeout: 10_000 })
    expect(tripwire.pageErrors).toEqual([])
  }, 45_000)

  it('uses a non-overflowing single-column file and preview flow on mobile', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-workspace-files-mobile'))
    await page.setViewportSize({ width: 390, height: 844 })
    const view = page.locator('[data-workspace-files-view]')
    await view.getByRole('button', { name: 'Back to file list' }).waitFor({ timeout: 10_000 })
    const previewGeometry = await view.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        viewportWidth: window.innerWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        ownOverflow: element.scrollWidth - element.clientWidth,
      }
    })
    expect(previewGeometry.left).toBeGreaterThanOrEqual(0)
    expect(previewGeometry.right).toBeLessThanOrEqual(previewGeometry.viewportWidth + 0.5)
    expect(previewGeometry.documentOverflow).toBeLessThanOrEqual(0)
    expect(previewGeometry.ownOverflow).toBeLessThanOrEqual(0)

    await view.getByRole('button', { name: 'Back to file list' }).click()
    await view.getByRole('button', { name: /README\.md/ }).waitFor({ timeout: 10_000 })
    const composer = page.locator('[data-composer-input][contenteditable="true"]').first()
    const composerBox = await composer.boundingBox()
    expect(composerBox).not.toBeNull()
    expect(composerBox!.x).toBeGreaterThanOrEqual(12)
    expect(composerBox!.x + composerBox!.width).toBeLessThanOrEqual(378)
    expect(composerBox!.y + composerBox!.height).toBeLessThanOrEqual(844)
    expect(tripwire.pageErrors).toEqual([])
  }, 45_000)
})
