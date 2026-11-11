import { expect, test } from "@playwright/test";

test("opens Place2Park and shows the search fields", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Place2Park/i);
  await expect(page.getByLabel("Date")).toBeVisible();
  await expect(page.getByLabel("Start time")).toBeVisible();
  await expect(page.getByLabel("Duration")).toBeVisible();
  const dateRow = page.locator("#search-date").locator("xpath=..");
  await expect(dateRow.locator("svg")).toBeVisible();
});

test("rejects a weak signup password before creating an account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("radio", { name: /Find parking/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/signup\/account/);
  await page.getByLabel("Full name").fill("E2E Driver");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Contact number").fill("9876543210");
  await page.getByLabel("Password", { exact: true }).fill("short");
  await page.getByLabel("Re-enter password").fill("short");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert")).toHaveText(/one uppercase letter, one number, and one special character/i);
  await expect(page).toHaveURL(/\/signup\/account/);
});

test("does not open a session when email delivery is unavailable", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("radio", { name: /Find parking/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("E2E Driver");
  await page.getByLabel("Email").fill(`e2e-${Date.now()}@example.com`);
  await page.getByLabel("Contact number").fill("9876543210");
  await page.getByLabel("Password", { exact: true }).fill("E2eTest1!aaaa");
  await page.getByLabel("Re-enter password").fill("E2eTest1!aaaa");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/dashboard/);
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  expect(token).toBeNull();
});

test("shows an error for invalid credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("driver@parkly.dev");
  await page.getByLabel("Password", { exact: true }).fill("not-the-seed-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
