export const API_TIMEOUT_MS = 25_000;
export const NETWORK_MESSAGE = "Can't reach the server. Check your connection.";
export const TIMEOUT_MESSAGE = "The server took too long to respond. Please try again.";

export class ApiRequestError extends Error {
  readonly status: number | null;
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, status: number | null, fieldErrors: Record<string, string> = {}) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Attach the stored access token. Login and OTP calls leave this off. */
  auth?: boolean;
  signal?: AbortSignal;
};

export type ApiClient = {
  request<T>(path: string, options?: RequestOptions): Promise<T>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function fieldErrorsFrom(payload: unknown): Record<string, string> {
  if (!isRecord(payload) || !isRecord(payload.errors)) return {};
  const errors: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.errors)) {
    if (Array.isArray(value) && typeof value[0] === "string" && value[0]) errors[key] = value[0];
  }
  return errors;
}

export function messageFrom(payload: unknown, status: number): string {
  if (isRecord(payload) && typeof payload.message === "string" && payload.message.trim()) return payload.message;
  if (status === 401) return "Your session has expired. Please log in again.";
  if (status) return `The server returned ${status}. Please try again.`;
  return "Something went wrong. Please try again.";
}

export function errorCodeFrom(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.code !== "string" || !payload.code.trim()) return null;
  return payload.code;
}

/** Shown on the login screen. Configuration failures stay visible. Secrets are never included. */
export function loginFailureMessage(err: unknown): string {
  if (err instanceof ApiRequestError) return err.message;
  if (err instanceof Error && err.message.includes("EXPO_PUBLIC_API_URL")) return err.message;
  return "Something went wrong. Please try again.";
}

function devRequestLog(details: { url: string; status: number | null; code: string | null; message: string }) {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__ === true;
  if (!dev) return;
  console.warn("[place2park] request", details);
}

export function createApiClient(options: {
  baseUrl: string;
  getAccessToken?: () => Promise<string | null>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): ApiClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? API_TIMEOUT_MS;

  return {
    async request<T>(path: string, init: RequestOptions = {}): Promise<T> {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (init.body !== undefined) headers["Content-Type"] = "application/json";
      if (init.auth !== false && options.getAccessToken) {
        const token = await options.getAccessToken();
        if (token) headers.Authorization = `Bearer ${token}`;
      }

      const url = `${baseUrl}${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let callerAborted = false;
      const abortFromCaller = () => {
        callerAborted = true;
        controller.abort();
      };
      init.signal?.addEventListener("abort", abortFromCaller);
      let response: Response;
      try {
        if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
        response = await fetchImpl(url, {
          method: init.method ?? "GET",
          headers,
          body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
          signal: controller.signal,
        });
      } catch (err) {
        if (callerAborted || init.signal?.aborted) {
          const aborted = new Error("aborted");
          aborted.name = "AbortError";
          throw aborted;
        }
        if (err instanceof Error && err.name === "AbortError") {
          devRequestLog({ url, status: null, code: null, message: TIMEOUT_MESSAGE });
          throw new ApiRequestError(TIMEOUT_MESSAGE, null);
        }
        devRequestLog({ url, status: null, code: null, message: NETWORK_MESSAGE });
        throw new ApiRequestError(NETWORK_MESSAGE, null);
      } finally {
        clearTimeout(timer);
        init.signal?.removeEventListener("abort", abortFromCaller);
      }

      const text = await response.text();
      let payload: unknown = null;
      if (text) {
        try {
          payload = JSON.parse(text) as unknown;
        } catch {
          payload = null;
        }
      }

      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        const message = messageFrom(payload, response.status);
        devRequestLog({ url, status: response.status, code: errorCodeFrom(payload), message });
        throw new ApiRequestError(message, response.status, fieldErrorsFrom(payload));
      }
      return payload.data as T;
    },
  };
}
