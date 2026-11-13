import { expect, type APIRequestContext, type Page } from "@playwright/test";

/** In-memory seed fixture. This is not a production credential. */
export const DEMO_PASSWORD = "password123";

export const DRIVER_EMAIL = "driver@parkly.dev";
export const HOST_EMAIL = "host@parkly.dev";
export const OTHER_HOST_EMAIL = "rohan@parkly.dev";
export const SPARE_DRIVER_EMAIL = "kabir@parkly.dev";

export const SYNTHETIC_ACCOUNT = "987654321098";

export async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/login\/verify/);
  const code = await readLoginCode(page.request, email);
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
}

async function readLoginCode(request: APIRequestContext, email: string) {
  const response = await request.get(`${API_ORIGIN}/api/__e2e/mailbox?email=${encodeURIComponent(email)}`, {
    headers: HOOK_HEADERS,
  });
  expect(response.ok()).toBeTruthy();
  const code = (await response.json()).data.code as string;
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

/** Password login plus the one email code. Returns the session token. */
export async function apiSession(request: APIRequestContext, email: string, password = DEMO_PASSWORD) {
  const loginResponse = await request.post(`${API_ORIGIN}/api/auth/login`, { data: { email, password } });
  expect(loginResponse.ok()).toBeTruthy();
  const pending = await loginResponse.json();
  expect(pending.data.token).toBeUndefined();
  const code = await readLoginCode(request, email);
  const verified = await request.post(`${API_ORIGIN}/api/auth/email-otp/verify`, {
    data: { pendingToken: pending.data.pendingToken, otp: code },
  });
  expect(verified.ok()).toBeTruthy();
  return (await verified.json()).data.token as string;
}

export const API_ORIGIN = `http://127.0.0.1:${process.env.E2E_PORT || "5055"}`;
export const CONSOLE_ORIGIN = `${API_ORIGIN}/e2e-console`;
export const HOOK_HEADERS = { "x-e2e-hook": "1" };

let slot = 0;

export function nextSlot() {
  slot += 1;
  const hour = 8 + (slot % 12);
  const minute = (slot * 13) % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
