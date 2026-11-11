export function isTimeoutError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return err.name === "TimeoutError" || err.name === "AbortError" || code === "ETIMEDOUT" || /timeout/i.test(err.message);
}

/**
 * Retry a read through the shared backoff engine.
 * Do not use this for a charge, capture, refund, or payout.
 */
export async function retryIdempotent<T>(
  work: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; isRetryable?: (err: unknown) => boolean }
): Promise<T> {
  const { classifyError, retryOperation } = await import("./retry.js");
  return retryOperation(work, {
    service: "shared",
    operation: "idempotent-read",
    maxAttempts: Math.max(1, Math.min(3, options.attempts)),
    initialDelayMs: options.baseDelayMs,
    maxDelayMs: 10_000,
    deadlineMs: 120_000,
    isRetryable:
      options.isRetryable ??
      ((err) => {
        const category = classifyError(err).category;
        return category === "timeout" || category === "transient_network" || category === "server" || category === "rate_limited";
      }),
  });
}

/** Reject if `promise` does not settle in time. Does not abort the underlying work. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
