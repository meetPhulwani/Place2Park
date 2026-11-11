import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_ORIGIN, HOOK_HEADERS } from "./support";

const PASSWORD = "E2eSignup1!ok";

function person() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    email: `e2e.${stamp}@place2park.test`,
    phone: `9${stamp.slice(-9)}`,
  };
}

async function readCode(request: APIRequestContext, email: string) {
  const response = await request.get(`${API_ORIGIN}/api/__e2e/mailbox?email=${encodeURIComponent(email)}`, {
    headers: HOOK_HEADERS,
  });
  expect(response.ok()).toBeTruthy();
  const code = (await response.json()).data.code as string;
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function startSignup(page: Page, email: string, phone: string) {
  await page.goto("/signup");
  await page.getByRole("radio", { name: /Find parking/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("E2E Driver");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contact number").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Re-enter password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\/verify-email/);
  await expect(page.getByLabel("Verification code")).toBeVisible();
}

test("verifies a new account after a wrong code, an expired code, and a resend", async ({ page }) => {
  test.setTimeout(180_000);
  const { email, phone } = person();
  await startSignup(page, email, phone);
  const tokenBefore = await page.evaluate(() => localStorage.getItem("parkly_token"));
  expect(tokenBefore).toBeNull();

  const first = await readCode(page.request, email);
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page.getByRole("alert")).toHaveText(/that code is incorrect/i);
  await expect(page).toHaveURL(/\/signup\/verify-email/);

  const expired = await page.request.post(`${API_ORIGIN}/api/__e2e/otp/expire`, {
    headers: HOOK_HEADERS,
    data: { email },
  });
  expect(expired.ok()).toBeTruthy();
  await page.getByLabel("Verification code").fill(first);
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page.getByRole("alert")).toHaveText(/that code has expired/i);

  await expect(page.getByRole("button", { name: "Resend OTP" })).toBeEnabled({ timeout: 75_000 });
  await page.waitForTimeout(1500);
  await Promise.all([
    page.waitForResponse((response) => response.url().includes("/auth/email-otp/resend") && response.ok()),
    page.getByRole("button", { name: "Resend OTP" }).click(),
  ]);
  await expect(page.getByLabel("Verification code")).toHaveValue("");
  const second = await readCode(page.request, email);
  expect(second).not.toBe(first);

  await page.getByLabel("Verification code").fill(first);
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page.getByRole("alert")).toHaveText(/that code is incorrect/i);

  await page.getByLabel("Verification code").fill(second);
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  expect(token).toBeTruthy();
});
