/** Desktop product naming shared by native window chrome. */

export const APP_NAME = 'DeepSeek Harness'

/** Stable native window title with the running package version. */
export function desktopWindowTitle(version: string): string {
  return `${APP_NAME} ${version}`
}
