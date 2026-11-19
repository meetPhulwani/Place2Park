export function digitsOnly(value: string, length = 6): string {
  return value.replace(/\D/g, "").slice(0, length);
}

export function resendWaitMs(resendAvailableAt: string, now = Date.now()): number {
  const at = Date.parse(resendAvailableAt);
  if (!Number.isFinite(at)) return 0;
  return Math.max(0, at - now);
}

export function isChallengeExpired(expiresAt: string, now = Date.now()): boolean {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) && at <= now;
}

export function formatWait(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${seconds}s`;
}
