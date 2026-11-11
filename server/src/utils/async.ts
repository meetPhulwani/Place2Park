export function isTimeoutError(err: unknown) {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return err.name === "TimeoutError" || err.name === "AbortError" || code === "ETIMEDOUT" || /timeout/i.test(err.message);
}

/**
 * Retry a read. Callers must not use this for a charge, capture, or refund
 * unless the provider honors an idempotency key the caller already sent.
 */
export async function retryIdempotent<T>(
  work: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; isRetryable?: (err: unknown) => boolean }
): Promise<T> {
  const attempts = Math.max(1, Math.min(3, options.attempts));
  const retryable = options.isRetryable ?? isTimeoutError;
  let last: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await work();
    } catch (err) {
      last = err;
      if (attempt === attempts || !retryable(err)) throw err;
      const backoff = options.baseDelayMs * 2 ** (attempt - 1);
      const jitter = Math.floor(Math.random() * Math.max(1, options.baseDelayMs));
      await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
    }
  }
  throw last;
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
