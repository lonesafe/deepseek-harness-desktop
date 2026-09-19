/** Managed DeepSeek Harness child process for the Electron launcher. */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const READY_PATTERN = /^dsh web: (http:\/\/127\.0\.0\.1:\d+(?:\/[^\s)]*)?)(?: \(LAN: (http:\/\/[^\s)]+)\))?(?:\s|$)/m
const STARTUP_TIMEOUT_MS = 120_000
const SHUTDOWN_GRACE_MS = 5_000
const MAX_DIAGNOSTIC_CHARS = 16_384

/** Options supplied by the Electron application. */
export interface HarnessProcessOptions {
  /** Electron executable reused through ELECTRON_RUN_AS_NODE. */
  executable: string
  /** Initial working directory for sessions created before a workspace is selected. */
  cwd: string
  /** Desktop-owned DSH_HOME. */
  home: string
  /** Authenticated LAN exposure selected by the desktop user. */
  lanAccess?: {
    enabled: boolean
    accessToken: string
  }
  /** Notification for an exit after readiness. */
  onUnexpectedExit(message: string): void
}

/** Running process, including startup settlement and bounded shutdown. */
export interface HarnessProcess {
  /** Resolves with the random loopback URL after the full Web composition settles. */
  readonly ready: Promise<HarnessReady>
  /** Last bounded slice of stdout and stderr for user-facing startup failures. */
  diagnostics(): string
  /** Idempotently requests graceful shutdown, then kills the owned process if necessary. */
  stop(): Promise<void>
}

/** Addresses printed after the managed Web composition settles. */
export interface HarnessReady {
  /** Canonical loopback URL loaded by Electron. */
  localUrl: string
  /** First LAN URL detected by the Web runtime, when LAN access is enabled. */
  lanUrl?: string
}

/**
 * Extract the readiness URL printed by the existing Web application.
 * @param output - accumulated process output.
 * @returns A loopback URL, or undefined before readiness.
 */
export function extractHarnessUrl(output: string): string | undefined {
  return extractHarnessReady(output)?.localUrl
}

/**
 * Extract both local and LAN readiness addresses from process output.
 * @param output - accumulated process output.
 * @returns Readiness addresses, or undefined before readiness.
 */
export function extractHarnessReady(output: string): HarnessReady | undefined {
  const match = READY_PATTERN.exec(output)
  const localUrl = match?.at(1)
  if (localUrl === undefined) return undefined
  const lanUrl = match?.at(2)
  return {
    localUrl,
    ...lanUrl === undefined ? {} : { lanUrl },
  }
}

/**
 * Build the embedded-Node invocation required by the production Web profile.
 * @param entry - resolved built dsh CLI entry.
 * @param lanAccess - persisted choice for authenticated LAN exposure.
 * @returns Node flags followed by the dsh Web command.
 */
export function harnessArguments(
  entry: string,
  lanAccess?: HarnessProcessOptions['lanAccess'],
): string[] {
  const args = ['--expose-internals', entry, 'web', '--no-open', '--port', '0']
  if (lanAccess?.enabled === true) {
    args.push('--host', '0.0.0.0', '--access-token', lanAccess.accessToken)
  }
  return args
}

/**
 * Keep Harness profile files away from Electron's own sockets and caches.
 * @param userData - Electron's per-user application-data directory.
 * @returns The dedicated Harness runtime directory.
 */
export function harnessHome(userData: string): string {
  return join(userData, 'runtime')
}

/** Resolve the built dsh entry from the installed production dependency tree. */
function resolveDshEntry(): string {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve('@deepseek-ai/dsh/package.json')
  return join(dirname(manifest), 'lib', 'bin.js')
}

/**
 * Resolve the packaged Node and pnpm launchers for the Web profile and its children.
 * @param executable - Electron executable owned by this application.
 * @param applicationRoot - Directory containing the desktop package manifest and assets.
 * @param parent - Parent environment; package operations apply their normal credential scrub.
 * @returns Environment with bundled commands ahead of system tools on PATH.
 */
export function resolveHarnessEnvironment(
  executable: string, applicationRoot: string, parent: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const require = createRequire(join(applicationRoot, 'package.json'))
  const pnpm = join(dirname(require.resolve('pnpm')), 'bin', 'pnpm.mjs')
  const environment = Object.fromEntries(Object.entries(parent).filter(([key]) => key.toUpperCase() !== 'PATH'))
  const pathKey = Object.keys(parent).find(key => key.toUpperCase() === 'PATH')
  const parentPath = pathKey === undefined ? undefined : parent[pathKey]
  return {
    ...environment,
    ELECTRON_RUN_AS_NODE: '1',
    ELECTRON_DESKTOP_EXECUTABLE: executable,
    ELECTRON_DESKTOP_PNPM_ENTRY: pnpm,
    PATH: [join(applicationRoot, 'build', 'runtime-bin'), parentPath].filter(Boolean).join(delimiter),
  }
}

/** Wait until a child exits or the grace period elapses. */
function waitForExit(child: ReturnType<typeof spawn>, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

/** Kill only the process tree owned by this desktop launch. */
async function forceStop(child: ReturnType<typeof spawn>): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform !== 'win32') {
    child.kill('SIGKILL')
    await waitForExit(child, SHUTDOWN_GRACE_MS)
    return
  }
  const pid = child.pid
  if (pid === undefined) return
  const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
    stdio: 'ignore',
    windowsHide: true,
  })
  await waitForExit(killer, SHUTDOWN_GRACE_MS)
}

/** Format an exit without assuming either exit field is populated. */
function exitMessage(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return `DeepSeek Harness stopped with signal ${signal}.`
  return `DeepSeek Harness stopped with exit code ${String(code ?? 'unknown')}.`
}

/**
 * Start `dsh web` under Electron's embedded Node runtime.
 * @param options - executable, data locations, and exit observer.
 * @returns The managed process immediately, before its readiness promise settles.
 */
export function startHarnessProcess(options: HarnessProcessOptions): HarnessProcess {
  const child = spawn(options.executable, harnessArguments(resolveDshEntry(), options.lanAccess), {
    cwd: options.cwd,
    env: {
      ...resolveHarnessEnvironment(options.executable, fileURLToPath(new URL('../', import.meta.url)), process.env),
      DSH_HOME: options.home,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')

  let output = ''
  let stopped = false
  let settled = false
  const append = (chunk: string): void => {
    output = `${output}${chunk}`.slice(-MAX_DIAGNOSTIC_CHARS)
  }

  const ready = new Promise<HarnessReady>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      void forceStop(child)
      reject(new Error(`DeepSeek Harness did not become ready within ${String(STARTUP_TIMEOUT_MS / 1000)} seconds.`))
    }, STARTUP_TIMEOUT_MS)
    const acceptChunk = (chunk: string): void => {
      append(chunk)
      if (settled) return
      const readiness = extractHarnessReady(output)
      if (readiness === undefined) return
      settled = true
      clearTimeout(timer)
      resolve(readiness)
    }
    child.stdout.on('data', acceptChunk)
    child.stderr.on('data', append)
    child.once('error', (error) => {
      append(`\n${error.message}`)
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('exit', (code, signal) => {
      const message = exitMessage(code, signal)
      if (!settled) {
        settled = true
        clearTimeout(timer)
        reject(new Error(message))
        return
      }
      if (!stopped) options.onUnexpectedExit(message)
    })
  })

  return {
    ready,
    diagnostics: () => output.trim(),
    async stop() {
      if (stopped) return
      stopped = true
      if (child.exitCode !== null || child.signalCode !== null) return
      child.kill('SIGTERM')
      if (await waitForExit(child, SHUTDOWN_GRACE_MS)) return
      await forceStop(child)
    },
  }
}
