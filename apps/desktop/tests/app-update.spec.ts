import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  desktopClientURL, downloadDesktopUpdate, latestDesktopUpdate,
  type DesktopUpdateAsset,
} from '../src/app-update.ts'

const temporaryRoots: string[] = []

afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(temporaryRoots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('desktop update metadata', () => {
  it('adds desktop facts and the official portal origin to the local product URL', () => {
    const result = new URL(desktopClientURL('http://127.0.0.1:43210/?existing=kept', {
      version: '1.0.0-beta.6',
      platform: 'darwin',
      arch: 'arm64',
      portalUrl: 'https://dsh.roubsite.com',
    }))
    expect(result.origin).toBe('http://127.0.0.1:43210')
    expect(result.searchParams.get('existing')).toBe('kept')
    expect(result.searchParams.get('dsh_desktop_version')).toBe('1.0.0-beta.6')
    expect(result.searchParams.get('dsh_desktop_platform')).toBe('darwin')
    expect(result.searchParams.get('dsh_desktop_arch')).toBe('arm64')
    expect(result.searchParams.get('dsh_update_origin')).toBe('https://dsh.roubsite.com')
  })
})

describe('desktop portal updates', () => {
  it('accepts update metadata only when the installer belongs to the portal', async () => {
    const response = {
      update_available: true,
      release: {
        version: '1.0.0-beta.6',
        asset: {
          file_name: 'DeepSeek-Harness-1.0.0-beta.6-mac-arm64.dmg',
          download_url: 'https://dsh.roubsite.com/downloads/id/package.dmg',
          size: 123,
          sha256: 'a'.repeat(64),
          kind: 'dmg',
        },
      },
    }
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(response), { status: 200 }))))
    await expect(latestDesktopUpdate({
      version: '1.0.0-beta.5', platform: 'darwin', arch: 'arm64', portalUrl: 'https://dsh.roubsite.com',
    })).resolves.toMatchObject({ version: '1.0.0-beta.6', size: 123, kind: 'dmg' })

    response.release.asset.download_url = 'https://github.com/example/package.dmg'
    await expect(latestDesktopUpdate({
      version: '1.0.0-beta.5', platform: 'darwin', arch: 'arm64', portalUrl: 'https://dsh.roubsite.com',
    })).rejects.toThrow(/无效/u)
  })

  it('downloads to a new file only after exact size and SHA-256 verification', async () => {
    const content = Buffer.from('verified desktop installer')
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-length': String(content.byteLength) })
      response.end(content)
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('test server did not bind')
      const root = await mkdtemp(join(tmpdir(), 'dsh-app-update-'))
      temporaryRoots.push(root)
      const asset: DesktopUpdateAsset = {
        version: '1.0.0-beta.6',
        fileName: 'DeepSeek-Harness.dmg',
        downloadURL: `http://127.0.0.1:${address.port}/downloads/id/DeepSeek-Harness.dmg`,
        size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
        kind: 'dmg',
      }
      const progress: number[] = []
      const destination = await downloadDesktopUpdate(asset, {
        temporary: join(root, 'temporary'), downloads: join(root, 'downloads'),
      }, (received) => { progress.push(received) })
      expect(await readFile(destination)).toEqual(content)
      expect(progress.at(-1)).toBe(content.byteLength)
      expect(await readdir(join(root, 'temporary'))).toEqual([])

      await expect(downloadDesktopUpdate({ ...asset, sha256: '0'.repeat(64) }, {
        temporary: join(root, 'temporary'), downloads: join(root, 'bad-downloads'),
      })).rejects.toThrow(/SHA-256/u)
      expect(await readdir(join(root, 'bad-downloads'))).toEqual([])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
      })
    }
  })

  it('cancels an active download and removes every incomplete file', async () => {
    const first = Buffer.alloc(16 * 1024, 1)
    const second = Buffer.alloc(16 * 1024, 2)
    const content = Buffer.concat([first, second])
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-length': String(content.byteLength) })
      response.write(first)
      setTimeout(() => { response.end(second) }, 200)
    })
    await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', resolve) })
    try {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('test server did not bind')
      const root = await mkdtemp(join(tmpdir(), 'dsh-app-update-cancel-'))
      temporaryRoots.push(root)
      const temporary = join(root, 'temporary')
      const downloads = join(root, 'downloads')
      const controller = new AbortController()
      const asset: DesktopUpdateAsset = {
        version: '1.0.0-beta.6',
        fileName: 'DeepSeek-Harness.dmg',
        downloadURL: `http://127.0.0.1:${address.port}/downloads/id/DeepSeek-Harness.dmg`,
        size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
        kind: 'dmg',
      }
      await expect(downloadDesktopUpdate(asset, { temporary, downloads }, () => {
        controller.abort()
      }, controller.signal)).rejects.toThrow()
      expect(await readdir(temporary)).toEqual([])
      expect(await readdir(downloads)).toEqual([])

      const finalController = new AbortController()
      const finalTemporary = join(root, 'final-temporary')
      const finalDownloads = join(root, 'final-downloads')
      await expect(downloadDesktopUpdate(asset, {
        temporary: finalTemporary,
        downloads: finalDownloads,
      }, (received, total) => {
        if (received === total) finalController.abort()
      }, finalController.signal)).rejects.toThrow()
      expect(await readdir(finalTemporary)).toEqual([])
      expect(await readdir(finalDownloads)).toEqual([])
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => { if (error) reject(error); else resolve() })
      })
    }
  })
})
