export const REVEAL_TTL_MS = 60_000;

export function accountDigitsLabel(last4: string, revealed: string | null) {
  return revealed ? revealed : `****${last4}`;
}

export type RevealClearReason = "hide" | "unmount" | "refresh" | "hidden" | "ttl";

/** Full account digits stay in row memory only until hide, leave, refresh, or TTL. */
export function nextRevealedAccount(
  current: string | null,
  action: "reveal" | RevealClearReason,
  accountNumber?: string
): string | null {
  if (action === "reveal") return accountNumber ?? current;
  return null;
}
