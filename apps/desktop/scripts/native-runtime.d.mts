/**
 * Exercise the deployed platform addon and require the Linux launcher payload.
 * Every loaded .node binary must resolve inside the application directory.
 * @param executable Electron executable, run with ELECTRON_RUN_AS_NODE.
 * @param applicationRoot Deployed application directory containing package.json.
 * @param label Diagnostic name for the staged or packaged application.
 * @returns Nothing. Throws when resolution escapes the application or a native operation fails.
 */
export function verifyDesktopNativeRuntime(executable: string, applicationRoot: string, label: string): void
