import { timeouts } from "../config/timeouts.js";
import { ApiError } from "../middleware/error.js";

/**
 * One retry policy for the API. Full jitter (AWS) spreads retries across the
 * whole window so callers do not line up on the same delay.
 * Charges, captures, refunds, booking creation, uploads, and payouts stay at
 * one attempt. A timeout is not treated as a failed payment.
 */
export type ErrorCategory =
  | "transient_network"
  | "timeout"
  | "cancellation"
  | "rate_limited"
  | "server"
  | "validation"
  | "auth"
  | "business"
  | "permanent"
  | "unknown";

export type ClassifiedError = {
  category: ErrorCategory;
  status?: number;
  retryAfterMs?: number;
};

const TRANSIENT_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "EPIPE",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const DEFAULT_RETRY_CATEGORIES: ErrorCategory[] = ["transient_network", "server", "rate_limited"];

export type RetryMetric = {
  attempts: number;
  recovered: number;
  exhausted: number;
  delayMs: number;
  durationMs: number;
  timeouts: number;
  transient: number;
  permanent: number;
};

const metrics = new Map<string, RetryMetric>();

function emptyMetric(): RetryMetric {
  return { attempts: 0, recovered: 0, exhausted: 0, delayMs: 0, durationMs: 0, timeouts: 0, transient: 0, permanent: 0 };
}

function metric(service: string) {
  const key = service.replace(/[^a-z0-9_-]/gi, "").slice(0, 40) || "unknown";
  const current = metrics.get(key) ?? emptyMetric();
  metrics.set(key, current);
  return current;
}

export function retryMetricsSnapshot(): Record<string, RetryMetric> {
  return Object.fromEntries([...metrics.entries()].map(([key, value]) => [key, { ...value }]));
}

export function resetRetryMetrics() {
  metrics.clear();
}

function noteCategory(service: string, category: ErrorCategory) {
  const row = metric(service);
  if (category === "timeout") row.timeouts += 1;
  else if (category === "transient_network" || category === "server" || category === "rate_limited") row.transient += 1;
  else if (category === "validation" || category === "auth" || category === "business" || category === "permanent") row.permanent += 1;
}

/** Writes that must not be repeated when the provider may already have accepted them. */
export const singleAttempt = {
  razorpayCharge: 1,
  razorpayRefund: 1,
  bookingCreate: 1,
  cloudinaryUpload: 1,
  payoutTransfer: 1,
  smtpSend: 1,
} as const;

export function backoffCap(retryNumber: number, initialDelayMs: number, multiplier: number, maxDelayMs: number) {
  const exponent = Math.max(0, retryNumber - 1);
  const raw = initialDelayMs * multiplier ** exponent;
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(maxDelayMs, raw);
}

/** Full jitter: a uniform wait from 0 through the capped exponential window. */
export function fullJitterDelay(capMs: number, random: number) {
  if (capMs <= 0) return 0;
  const unit = Math.min(1, Math.max(0, random));
  if (unit >= 1) return Math.floor(capMs);
  return Math.floor(unit * (capMs + 1));
}

export function parseRetryAfter(header: string | null | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dated = Date.parse(trimmed);
  if (Number.isNaN(dated)) return undefined;
  return Math.max(0, dated - now);
}

export function chooseDelay(
  retryNumber: number,
  initialDelayMs: number,
  multiplier: number,
  maxDelayMs: number,
  random: number,
  retryAfterMs?: number
) {
  if (retryAfterMs != null && retryAfterMs >= 0) return Math.min(maxDelayMs, retryAfterMs);
  return fullJitterDelay(backoffCap(retryNumber, initialDelayMs, multiplier, maxDelayMs), random);
}

function readStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const record = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const value = record.status ?? record.statusCode ?? record.response?.status;
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function headerValue(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const headers = (err as { headers?: Record<string, unknown>; response?: { headers?: Record<string, unknown> } }).headers
    ?? (err as { response?: { headers?: Record<string, unknown> } }).response?.headers;
  if (!headers) return undefined;
  const raw = headers["retry-after"] ?? headers["Retry-After"];
  return typeof raw === "string" ? raw : undefined;
}

function isTimeout(err: unknown) {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return err.name === "TimeoutError" || code === "ETIMEDOUT" || /timeout/i.test(err.message);
}

function isCancellation(err: unknown) {
  if (!(err instanceof Error) || isTimeout(err)) return false;
  const code = (err as { code?: string }).code;
  return err.name === "AbortError" || err.name === "CanceledError" || code === "ERR_CANCELED";
}

export function classifyError(err: unknown, now = Date.now()): ClassifiedError {
  if (isCancellation(err)) return { category: "cancellation" };
  const status = readStatus(err);
  const directRetryAfter = err && typeof err === "object" ? (err as { retryAfterMs?: unknown }).retryAfterMs : undefined;
  const retryAfterMs = typeof directRetryAfter === "number" && directRetryAfter >= 0
    ? directRetryAfter
    : parseRetryAfter(headerValue(err), now);
  if (status === 408) return { category: "timeout", status, retryAfterMs };
  if (status === 429) return { category: "rate_limited", status, retryAfterMs };
  if (status != null && [500, 502, 503, 504].includes(status)) return { category: "server", status, retryAfterMs };
  if (status === 400 || status === 422) return { category: "validation", status };
  if (status === 401 || status === 403) return { category: "auth", status };
  if (status === 409) return { category: "business", status };
  if (status === 404) return { category: "permanent", status };
  if (status != null && status >= 400 && status < 500) return { category: "permanent", status };
  if (isTimeout(err)) return { category: "timeout", retryAfterMs };
  const code = err && typeof err === "object" ? String((err as { code?: string }).code ?? "") : "";
  if (TRANSIENT_CODES.has(code)) return { category: "transient_network" };
  if (err instanceof ApiError) return { category: "business", status: err.status };
  return { category: "unknown" };
}

export type RetryPolicy<T> = {
  service: string;
  operation: string;
  initialDelayMs?: number;
  multiplier?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  deadlineMs?: number;
  signal?: AbortSignal;
  retryCategories?: ErrorCategory[];
  isRetryable?: (err: unknown) => boolean;
  retryableResult?: (value: T) => { status: number; retryAfterMs?: number } | null;
  now?: () => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
  log?: (event: { service: string; operation: string; attempt: number; delayMs: number; category: ErrorCategory }) => void;
};

function defaultSleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("retry cancelled"), { name: "AbortError", code: "ERR_CANCELED" }));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function logRetry(event: { service: string; operation: string; attempt: number; delayMs: number; category: ErrorCategory }) {
  console.info(JSON.stringify({ event: "retry", ...event }));
}

function clampAttempts(value: number) {
  if (!Number.isInteger(value)) return 1;
  return Math.max(1, Math.min(4, value));
}

export async function retryOperation<T>(work: () => Promise<T>, policy: RetryPolicy<T>): Promise<T> {
  const maxAttempts = clampAttempts(policy.maxAttempts ?? timeouts.retryMaxAttempts);
  const initialDelayMs = policy.initialDelayMs ?? timeouts.retryInitialDelayMs;
  const multiplier = policy.multiplier ?? 2;
  const maxDelayMs = policy.maxDelayMs ?? timeouts.retryMaxDelayMs;
  const deadlineMs = policy.deadlineMs ?? Number.POSITIVE_INFINITY;
  const now = policy.now ?? Date.now;
  const sleep = policy.sleep ?? defaultSleep;
  const random = policy.random ?? Math.random;
  const categories = policy.retryCategories ?? DEFAULT_RETRY_CATEGORIES;
  const started = now();
  const row = metric(policy.service);
  let hadFailure = false;
  let lastError: unknown;

  const finish = () => {
    row.durationMs += Math.max(0, now() - started);
    if (hadFailure && lastError == null) row.recovered += 1;
  };

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (policy.signal?.aborted) {
        noteCategory(policy.service, "cancellation");
        throw Object.assign(new Error("retry cancelled"), { name: "AbortError", code: "ERR_CANCELED" });
      }
      let failure: unknown;
      try {
        const value = await work();
        const again = policy.retryableResult?.(value);
        if (!again || attempt === maxAttempts) {
          lastError = null;
          return value;
        }
        failure = Object.assign(new Error(`HTTP ${again.status}`), {
          status: again.status,
          retryAfterMs: again.retryAfterMs,
        });
      } catch (err) {
        failure = err;
        if (isCancellation(err)) {
          noteCategory(policy.service, "cancellation");
          throw err;
        }
      }

      lastError = failure;
      hadFailure = true;
      const classified = classifyError(failure, now());
      noteCategory(policy.service, classified.category);
      const allowed = policy.isRetryable ? policy.isRetryable(failure) : categories.includes(classified.category);
      if (!allowed || attempt === maxAttempts) {
        if (allowed && maxAttempts > 1) row.exhausted += 1;
        throw failure;
      }
      const delayMs = chooseDelay(attempt, initialDelayMs, multiplier, maxDelayMs, random(), classified.retryAfterMs);
      if (now() - started + delayMs > deadlineMs) {
        row.exhausted += 1;
        throw failure;
      }
      const event = {
        service: policy.service,
        operation: policy.operation,
        attempt,
        delayMs,
        category: classified.category,
      };
      (policy.log ?? logRetry)(event);
      row.attempts += 1;
      row.delayMs += delayMs;
      try {
        await sleep(delayMs, policy.signal);
      } catch (err) {
        noteCategory(policy.service, "cancellation");
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("retry stopped");
  } finally {
    finish();
  }
}
