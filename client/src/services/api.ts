import axios, { AxiosError } from "axios";

/** Axios instance for the Parkly Express API. */
export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || "/api",
  timeout: 25_000,
});

const TOKEN_KEY = "parkly_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Extract the server's user-facing message from an Axios error. */
export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
    if (err.code === "ECONNABORTED" || /timeout/i.test(err.message)) {
      return "The server took too long to respond. Please try again.";
    }
    if (err.code === "ERR_NETWORK") return "Can't reach the server. Check your connection.";
  }
  return fallback;
}

export function errorStatus(err: unknown): number | null {
  return err instanceof AxiosError ? err.response?.status ?? null : null;
}

/** Zod field errors from a 422 validation response, flattened to one message per field. */
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
