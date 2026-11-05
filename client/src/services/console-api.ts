import axios, { AxiosError } from "axios";

const CSRF_COOKIE = "p2p_adm_csrf";

function readCsrf() {
  const parts = document.cookie.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : "";
}

/** Cookie session client for the isolated admin console. Tokens stay in HttpOnly cookies. */
export const consoleApi = axios.create({
  baseURL: "/api/console",
  timeout: 25_000,
  withCredentials: true,
});

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
  }
  return fallback;
}
