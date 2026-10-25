/** Demo login hints are local-only. Production builds must never render them. */
export function shouldShowDemoAccounts(isDev: boolean | undefined) {
  return isDev === true;
}
