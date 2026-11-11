import { AxiosError } from "axios";

const configured = Number(import.meta.env?.VITE_API_TIMEOUT_MS);
/** Client budget. Shorter than the API backstop so the page can show a retry. */
export const API_TIMEOUT_MS = Number.isInteger(configured) && configured >= 1000 && configured <= 120_000 ? configured : 25_000;

export function isRequestTimeout(err: unknown) {
  return err instanceof AxiosError && (err.code === "ECONNABORTED" || /timeout/i.test(err.message));
}

export function isRequestAbort(err: unknown) {
  return err instanceof AxiosError && (err.code === "ERR_CANCELED" || err.name === "CanceledError");
}

/** Non-idempotent calls are never repeated by the client. Reads are not auto-retried either. */
export function canAutoRetry(method: string | undefined) {
  void method;
  return false;
}

/** Ignores a second call while the first is still running. */
export function createSingleFlight() {
  let pending = false;
  return async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (pending) return undefined;
    pending = true;
    try {
      return await action();
    } finally {
      pending = false;
    }
  };
}
