/** URL policy for the privileged desktop window. */

/**
 * Whether a navigation remains inside the random loopback Harness origin.
 * @param target - navigation URL.
 * @param appOrigin - origin returned by the managed Harness process.
 * @returns True only for an exact origin match.
 */
export function isAppNavigation(target: string, appOrigin: string | undefined): boolean {
  if (appOrigin === undefined) return false
  try {
    return new URL(target).origin === appOrigin
  } catch {
    return false
  }
}

/**
 * Whether an untrusted renderer URL may be handed to the system browser.
 * @param target - requested external URL.
 * @returns True only for HTTPS URLs without embedded credentials.
 */
export function isSafeExternalUrl(target: string): boolean {
  try {
    const url = new URL(target)
    return url.protocol === 'https:' && url.username === '' && url.password === ''
  } catch {
    return false
  }
}
