import axios, { AxiosError } from "axios";
import { resolveApiBase } from "@/lib/api-base";
import { attachTransientGetRetry } from "@/lib/retry";
import { API_TIMEOUT_MS, isRequestAbort, isRequestTimeout } from "@/lib/request-timeout";

/** Axios instance for the Parkly Express API. GET may retry a transient failure. POST does not. */
export const api = axios.create({
  baseURL: resolveApiBase(import.meta.env?.VITE_API_URL),
  timeout: API_TIMEOUT_MS,
});
attachTransientGetRetry(api);

const TOKEN_KEY = "parkly_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function authorizationHeader(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

api.interceptors.request.use((config) => {
  const header = authorizationHeader(getToken());
  if (header.Authorization) config.headers.Authorization = header.Authorization;
  return config;
});

/** Extract the server's user-facing message from an Axios error. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
    if (isRequestAbort(err)) return fallback;
    if (isRequestTimeout(err)) {
      return "The server took too long to respond. Please try again.";
    }
    if (err.code === "ERR_NETWORK") return "Can't reach the server. Check your connection.";
  }
  return fallback;
}

export function errorStatus(err: unknown): number | null {
  return err instanceof AxiosError ? err.response?.status ?? null : null;
}

/** Zod field errors from a validation response, flattened to one message per field. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (err instanceof AxiosError) {
    const errors = (err.response?.data as { errors?: Record<string, string[]> } | undefined)?.errors;
    if (errors) {
      return Object.fromEntries(
        Object.entries(errors)
          .filter(([, v]) => Array.isArray(v) && v.length > 0)
          .map(([k, v]) => [k, v[0]])
      );
    }
  }
  return {};
}
