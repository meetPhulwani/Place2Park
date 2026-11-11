import axios, { AxiosError } from "axios";
import { attachTransientGetRetry } from "@/lib/retry";
import { API_TIMEOUT_MS, isRequestTimeout } from "@/lib/request-timeout";

const CSRF_COOKIE = "p2p_adm_csrf";

function readCsrf() {
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : "";
}

/** Cookie session client for the isolated admin console. Tokens stay in HttpOnly cookies. */
export const consoleApi = axios.create({
  baseURL: "/api/console",
  timeout: API_TIMEOUT_MS,
  withCredentials: true,
});
attachTransientGetRetry(consoleApi);

export const api = consoleApi;

consoleApi.interceptors.request.use((config) => {
  const csrf = readCsrf();
  if (csrf) config.headers["x-csrf-token"] = csrf;
  return config;
});

export function errorMessage(err: unknown, fallback = "Something went wrong. Please try again.") {
  return consoleError(err, fallback);
}

export function consoleError(err: unknown, fallback = "Something went wrong. Please try again.") {
  if (err instanceof AxiosError) {
    const msg = (err.response?.data as { message?: string } | undefined)?.message;
    if (msg) return msg;
    if (isRequestTimeout(err)) return "The server took too long to respond. Please try again.";
  }
  return fallback;
}
