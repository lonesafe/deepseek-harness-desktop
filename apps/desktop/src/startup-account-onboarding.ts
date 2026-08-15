/** Optional account onboarding shown before the desktop product surface starts. */

/** Desktop-owned actions used by startup account onboarding. */
export interface StartupAccountOnboardingActions {
  hasAuthorization: () => boolean
  prompt: () => Promise<'authorize' | 'skip'>
  authorize: () => Promise<void>
}

/** Offer browser authorization once while allowing local-only use without an account. */
export async function offerStartupAccountAuthorization(actions: StartupAccountOnboardingActions): Promise<void> {
  if (actions.hasAuthorization()) return
  if (await actions.prompt() === 'skip') return
  await actions.authorize()
}
