import { e2eHooksEnabled } from "./e2e-gate.js";

const mailbox = new Map<string, string>();

function allowed(email: string) {
  return email.endsWith("@place2park.test");
}

/** Keeps a verification code in this process. Refuses every other environment and every other domain. */
export function rememberTestCode(email: string, code: string) {
  if (!e2eHooksEnabled()) return;
  const key = email.toLowerCase().trim();
  if (!allowed(key)) return;
  mailbox.set(key, code);
}

export function readTestCode(email: string) {
  if (!e2eHooksEnabled()) return null;
  const key = email.toLowerCase().trim();
  if (!allowed(key)) return null;
  return mailbox.get(key) ?? null;
}
