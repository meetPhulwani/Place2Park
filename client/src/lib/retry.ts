import { AxiosError, CanceledError, type AxiosInstance, type InternalAxiosRequestConfig } from "axios";
import { canAutoRetry, isRequestAbort } from "./request-timeout";

/**
 * Client half of the shared backoff policy. GET and HEAD only.
 * POST, PATCH, and DELETE are not repeated. Cancellation is not a retry.
 * Full jitter matches the API: wait is uniform from 0 through the capped window.
 */
export const CLIENT_GET_RETRY = {
  initialDelayMs: 500,
  multiplier: 2,
  maxDelayMs: 10_000,
  maxRetries: 3,
  deadlineMs: 8_000,
} as const;

type RetryState = InternalAxiosRequestConfig & {
  __p2pStarted?: number;
  __p2pAttempt?: number;
};

export function backoffCap(retryNumber: number, initialDelayMs: number, multiplier: number, maxDelayMs: number) {
  const raw = initialDelayMs * multiplier ** Math.max(0, retryNumber - 1);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.min(maxDelayMs, raw);
}

export function fullJitterDelay(capMs: number, random: number) {
  if (capMs <= 0) return 0;
  const unit = Math.min(1, Math.max(0, random));
  if (unit >= 1) return Math.floor(capMs);
  return Math.floor(unit * (capMs + 1));
}

export function parseRetryAfter(header: string | undefined, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dated = Date.parse(trimmed);
  if (Number.isNaN(dated)) return undefined;
  return Math.max(0, dated - now);
}

function headerRetryAfter(err: AxiosError, now: number) {
  const headers = err.response?.headers as { get?: (name: string) => unknown; "retry-after"?: unknown } | undefined;
  const raw = headers?.get?.("retry-after") ?? headers?.["retry-after"];
  return parseRetryAfter(typeof raw === "string" ? raw : undefined, now);
}

export function clientRetryDelay(retryNumber: number, retryAfterMs: number | undefined, random: number) {
  if (retryAfterMs != null && retryAfterMs >= 0) return Math.min(CLIENT_GET_RETRY.maxDelayMs, retryAfterMs);
  return fullJitterDelay(
    backoffCap(retryNumber, CLIENT_GET_RETRY.initialDelayMs, CLIENT_GET_RETRY.multiplier, CLIENT_GET_RETRY.maxDelayMs),
    random
  );
}

function transientStatus(status: number | undefined) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function transientNetwork(err: AxiosError) {
  return err.code === "ERR_NETWORK" || err.code === "ECONNRESET" || err.code === "ECONNREFUSED" || err.code === "EAI_AGAIN";
}

export function planClientRetry(input: {
  method: string | undefined;
  error: AxiosError;
  attempt: number;
  startedAt: number;
  now: number;
  random?: number;
  aborted?: boolean;
}) {
  if (input.aborted || isRequestAbort(input.error)) return null;
  if (!canAutoRetry(input.method)) return null;
  if (input.attempt >= CLIENT_GET_RETRY.maxRetries) return null;
  const status = input.error.response?.status;
  const timedOut = input.error.code === "ECONNABORTED" || input.error.name === "TimeoutError";
  if (!transientStatus(status) && !transientNetwork(input.error) && !timedOut) return null;
  const retryAfterMs = headerRetryAfter(input.error, input.now);
  const delayMs = clientRetryDelay(input.attempt + 1, retryAfterMs, input.random ?? Math.random());
  if (input.now - input.startedAt + delayMs > CLIENT_GET_RETRY.deadlineMs) return null;
  return { delayMs, category: status === 429 ? "rate_limited" : timedOut || status === 408 ? "timeout" : "transient" };
}

function defaultSleep(ms: number, signal?: AbortSignal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new CanceledError("retry cancelled"));
    };
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function attachTransientGetRetry(
  instance: AxiosInstance,
  deps: {
    now?: () => number;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    random?: () => number;
  } = {}
) {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const random = deps.random ?? Math.random;
  instance.interceptors.request.use((config) => {
    const state = config as RetryState;
    if (state.__p2pStarted == null) state.__p2pStarted = now();
    return config;
  });
  instance.interceptors.response.use(undefined, async (error: unknown) => {
    if (!(error instanceof AxiosError) || !error.config) throw error;
    const state = error.config as RetryState;
    const startedAt = state.__p2pStarted ?? now();
    const attempt = state.__p2pAttempt ?? 0;
    if (state.signal?.aborted) throw error;
    const plan = planClientRetry({
      method: state.method,
      error,
      attempt,
      startedAt,
      now: now(),
      random: random(),
      aborted: state.signal?.aborted,
    });
    if (!plan) throw error;
    state.__p2pAttempt = attempt + 1;
    console.info(JSON.stringify({
      event: "retry",
      service: "client",
      operation: state.method ?? "get",
      attempt: attempt + 1,
      delayMs: plan.delayMs,
      category: plan.category,
    }));
    await sleep(plan.delayMs, (state.signal as AbortSignal | undefined) ?? undefined);
    return instance.request(state);
  });
}
