/**
 * Copy release CRT libraries into each executable directory of an installed engine.
 * @param source Visual Studio's architecture-specific Microsoft.VC*.CRT directory.
 * @param engineRoot Deployed Office engine package, never the workspace package store.
 * @returns Number of executable directories supplied with the runtime.
 */
export function copyWindowsCrt(source: string, engineRoot: string): number

/**
 * Locate the build host's redistributable release CRT and stage it with Office.
 * @param applicationRoot Completed production deployment directory.
 * @returns Nothing. Throws when the native engine or Visual Studio redist is missing.
 */
export function stageWindowsCrt(applicationRoot: string): void
