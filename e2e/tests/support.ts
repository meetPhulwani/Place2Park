import { expect, type Page } from "@playwright/test";

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
  await expect(page).toHaveURL((url) => new URL(url).pathname === "/");
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
