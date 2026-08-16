/** Desktop-only update metadata, portal lookup, and verified installer download. */

import { createHash, randomBytes } from 'node:crypto'
import { constants as fsConstants } from 'node:fs'
import { access, chmod, copyFile, mkdir, open, rm } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'

export const DESKTOP_UPDATE_ACTION_URL = 'dsh-update://download'
const MAX_UPDATE_SIZE = 3 * 1024 * 1024 * 1024

export interface DesktopClientUpdateOptions {
  version: string
  platform: NodeJS.Platform
  arch: string
  portalUrl: string
}

/** One portal-hosted installer selected for the current desktop. */
export interface DesktopUpdateAsset {
  version: string
  fileName: string
  downloadURL: string
  size: number
  sha256: string
  kind: string
}

/** Add non-secret desktop version metadata to the local Harness URL. */
export function desktopClientURL(localUrl: string, options: DesktopClientUpdateOptions): string {
  const target = new URL(localUrl)
  target.searchParams.set('dsh_desktop_version', options.version)
  target.searchParams.set('dsh_desktop_platform', options.platform)
  target.searchParams.set('dsh_desktop_arch', options.arch)
  target.searchParams.set('dsh_update_origin', new URL(options.portalUrl).origin)
  return target.toString()
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function safeUpdateURL(raw: string, portalOrigin: string): URL | undefined {
  try {
    const target = new URL(raw)
    if (target.origin !== portalOrigin || !target.pathname.startsWith('/downloads/')) return undefined
    if (target.username !== '' || target.password !== '' || target.hash !== '') return undefined
    return target
  } catch {
    return undefined
  }
}

/** Ask the official portal for the preferred installer for this desktop. */
export async function latestDesktopUpdate(
  options: DesktopClientUpdateOptions,
  signal?: AbortSignal,
): Promise<DesktopUpdateAsset | undefined> {
  const portalOrigin = new URL(options.portalUrl).origin
  const endpoint = new URL('/api/releases/latest', `${portalOrigin}/`)
  endpoint.searchParams.set('platform', options.platform)
  endpoint.searchParams.set('arch', options.arch)
  endpoint.searchParams.set('current_version', options.version)
  const response = await fetch(endpoint, {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`官网版本检查失败：HTTP ${response.status}`)
  const body = object(await response.json())
  if (body?.update_available !== true) return undefined
  const release = object(body.release)
  const asset = object(release?.asset)
  const version = release?.version
  const fileName = asset?.file_name
  const downloadURL = asset?.download_url
  const size = asset?.size
  const sha256 = asset?.sha256
  const kind = asset?.kind
  const safeURL = typeof downloadURL === 'string' ? safeUpdateURL(downloadURL, portalOrigin) : undefined
  if (typeof version !== 'string' || typeof fileName !== 'string' || basename(fileName) !== fileName
    || !/^[0-9A-Za-z][0-9A-Za-z._+()-]{0,254}$/u.test(fileName)
    || safeURL === undefined || typeof size !== 'number' || !Number.isSafeInteger(size) || size <= 0 || size > MAX_UPDATE_SIZE
    || typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(sha256)
    || typeof kind !== 'string') {
    throw new Error('官网返回了无效的版本安装包信息')
  }
  return { version, fileName, downloadURL: safeURL.toString(), size, sha256, kind }
}

async function unusedDownloadPath(directory: string, fileName: string): Promise<string> {
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let index = 0; index < 1000; index++) {
    const candidate = join(directory, index === 0 ? fileName : `${stem} (${index})${extension}`)
    try {
      await access(candidate)
    } catch {
      return candidate
    }
  }
  throw new Error('下载目录中存在过多同名安装包')
}

/** Download one same-origin installer, verify size and SHA-256, and publish it atomically. */
export async function downloadDesktopUpdate(
  asset: DesktopUpdateAsset,
  directories: { temporary: string; downloads: string },
  onProgress?: (received: number, total: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  const downloadURL = new URL(asset.downloadURL)
  const response = await fetch(downloadURL, {
    cache: 'no-store', credentials: 'omit', redirect: 'error',
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok || response.body === null || response.url !== downloadURL.toString()) {
    throw new Error(`安装包下载失败：HTTP ${response.status}`)
  }
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null && Number(declaredLength) !== asset.size) {
    throw new Error('安装包大小与官网版本信息不一致')
  }
  await mkdir(directories.temporary, { recursive: true })
  await mkdir(directories.downloads, { recursive: true })
  const temporaryPath = join(directories.temporary, `.dsh-update-${process.pid}-${randomBytes(12).toString('hex')}.part`)
  const destination = await unusedDownloadPath(directories.downloads, asset.fileName)
  const handle = await open(temporaryPath, 'wx', 0o600)
  let complete = false
  try {
    const hash = createHash('sha256')
    const reader = response.body.getReader()
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > asset.size) throw new Error('安装包超过官网声明的大小')
      hash.update(value)
      await handle.write(value)
      onProgress?.(received, asset.size)
    }
    await handle.sync()
    if (received !== asset.size) throw new Error('安装包下载不完整')
    if (hash.digest('hex') !== asset.sha256) throw new Error('安装包 SHA-256 校验失败')
    await handle.close()
    await copyFile(temporaryPath, destination, fsConstants.COPYFILE_EXCL)
    if (asset.kind === 'appimage') await chmod(destination, 0o755)
    complete = true
    return destination
  } finally {
    if (!complete) await handle.close().catch(() => {})
    await rm(temporaryPath, { force: true })
  }
}
