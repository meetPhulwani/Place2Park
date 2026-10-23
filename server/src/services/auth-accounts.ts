export type GoogleAccountRecord = {
  email: string;
  googleId?: string | null;
  passwordHash?: string | null;
};

export type GoogleLinkDecision = { action: "create" | "login" | "conflict" | "mismatch" };

/**
 * Never attach a Google subject to an existing email account that was not
 * created with that Google identity. Unverified password signups stay unlinked.
 */
export function resolveGoogleAccountLink(
  existing: GoogleAccountRecord | null,
  google: { sub: string; email: string }
): GoogleLinkDecision {
  if (!existing) return { action: "create" };
  if (existing.googleId && existing.googleId === google.sub) return { action: "login" };
  if (existing.googleId && existing.googleId !== google.sub) return { action: "mismatch" };
  return { action: "conflict" };
}
