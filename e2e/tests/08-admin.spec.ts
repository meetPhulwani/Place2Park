import { expect, test, type Page } from "@playwright/test";
import { API_ORIGIN, CONSOLE_ORIGIN, DRIVER_EMAIL, HOOK_HEADERS, login } from "./support";

async function actors(page: Page) {
  const response = await page.request.get(`${API_ORIGIN}/api/__e2e/actors`, { headers: HOOK_HEADERS });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as {
    adminEmail: string;
    supportEmail: string;
    password: string;
    answer: string;
  };
}

async function totp(page: Page, role: "admin" | "support") {
  const response = await page.request.get(`${API_ORIGIN}/api/__e2e/totp?role=${role}`, { headers: HOOK_HEADERS });
  expect(response.ok()).toBeTruthy();
  const code = (await response.json()).data.code as string;
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function mailbox(page: Page, email: string) {
  const response = await page.request.get(`${API_ORIGIN}/api/__e2e/mailbox?email=${encodeURIComponent(email)}`, {
    headers: HOOK_HEADERS,
  });
  expect(response.ok()).toBeTruthy();
  const code = (await response.json()).data.code as string;
  expect(code).toMatch(/^\d{6}$/);
  return code;
}

async function signIn(page: Page, email: string, password: string, answer: string, role: "admin" | "support", wrongCode = false) {
  await page.goto(`${CONSOLE_ORIGIN}/sign-in`);
  await expect(page.getByPlaceholder("Email")).toBeVisible({ timeout: 60_000 });
  await page.getByPlaceholder("Email").fill(email);
  await page.getByPlaceholder("Password").fill(password);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByPlaceholder("Email code")).toBeVisible();
  const code = await mailbox(page, email);
  if (wrongCode) {
    await page.getByPlaceholder("Email code").fill("000000");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("That code is incorrect.")).toBeVisible();
  }
  await page.getByPlaceholder("Email code").fill(code);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("What was the name of your first school?")).toBeVisible();
  await page.getByPlaceholder("Answer").fill(answer);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByPlaceholder("Authenticator code")).toBeVisible();
  await page.getByPlaceholder("Authenticator code").fill(await totp(page, role));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Admin Console / Dashboard")).toBeVisible();
}

async function openSection(page: Page, label: string) {
  const opener = page.getByRole("button", { name: "Open navigation" });
  if (await opener.isVisible()) await opener.click();
  await page.locator(`a[aria-label="${label}"]:visible`).click();
}

test("signs in with all four factors and reviews a listing, a payout, and the audit log", async ({ page }) => {
  test.setTimeout(180_000);
  const listingResponse = await page.request.post(`${API_ORIGIN}/api/__e2e/fixtures/listing`, { headers: HOOK_HEADERS });
  const payoutResponse = await page.request.post(`${API_ORIGIN}/api/__e2e/fixtures/payout`, { headers: HOOK_HEADERS });
  expect(listingResponse.ok()).toBeTruthy();
  expect(payoutResponse.ok()).toBeTruthy();
  const listing = (await listingResponse.json()).data as { title: string };
  const payout = (await payoutResponse.json()).data as { holder: string };
  const account = await actors(page);

  await signIn(page, account.adminEmail, account.password, account.answer, "admin", true);
  await openSection(page, "Listings");
  await expect(page.getByRole("heading", { name: "Listings" })).toBeVisible();
  const row = page.locator(".glass").filter({ hasText: listing.title });
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("Listing approved and live.")).toBeVisible();

  await openSection(page, "Payouts");
  await expect(page.getByRole("heading", { name: "Payouts" })).toBeVisible();
  const card = page.locator(".glass").filter({ hasText: payout.holder });
  await card.getByRole("button", { name: "Approve" }).click();
  await expect(card.getByText("APPROVED")).toBeVisible();

  await openSection(page, "Audit log");
  await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "listing.moderate" }).first()).toBeVisible();
});

test("requires the CSRF token, then accepts the matching token", async ({ page }) => {
  test.setTimeout(180_000);
  const created = await page.request.post(`${API_ORIGIN}/api/__e2e/fixtures/listing`, { headers: HOOK_HEADERS });
  expect(created.ok()).toBeTruthy();
  const listing = (await created.json()).data as { id: string };
  const account = await actors(page);
  await signIn(page, account.adminEmail, account.password, account.answer, "admin");

  const blocked = await page.request.post(`${API_ORIGIN}/api/console/listings/${listing.id}/moderate`, {
    data: { action: "approve" },
  });
  expect(blocked.status()).toBe(403);
  expect((await blocked.json()).message).toBe("Request blocked.");

  const cookies = await page.context().cookies();
  const csrf = cookies.find((cookie) => cookie.name === "p2p_adm_csrf")?.value ?? "";
  expect(csrf.length).toBeGreaterThan(10);
  const allowed = await page.request.post(`${API_ORIGIN}/api/console/listings/${listing.id}/moderate`, {
    headers: { "x-csrf-token": csrf },
    data: { action: "approve" },
  });
  expect(allowed.ok()).toBeTruthy();
});

test("logs out of the console", async ({ page }) => {
  test.setTimeout(180_000);
  const account = await actors(page);
  await signIn(page, account.adminEmail, account.password, account.answer, "admin");
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.locator("div.absolute").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  const session = await page.request.get(`${API_ORIGIN}/api/console/auth/session`);
  expect(session.status()).toBe(404);
});

test("ends a console session after the idle window has passed", async ({ page }) => {
  test.setTimeout(180_000);
  const account = await actors(page);
  await signIn(page, account.adminEmail, account.password, account.answer, "admin");
  const aged = await page.request.post(`${API_ORIGIN}/api/__e2e/session/expire`, { headers: HOOK_HEADERS });
  expect(aged.ok()).toBeTruthy();
  await page.goto(`${CONSOLE_ORIGIN}/`);
  await expect(page.getByPlaceholder("Email")).toBeVisible();
});

test("keeps a support administrator out of listings and payouts", async ({ page }) => {
  test.setTimeout(180_000);
  const account = await actors(page);
  await signIn(page, account.supportEmail, account.password, account.answer, "support");
  const listings = await page.request.get(`${API_ORIGIN}/api/console/listings`);
  const payouts = await page.request.get(`${API_ORIGIN}/api/console/payouts`);
  expect(listings.status()).toBe(403);
  expect(payouts.status()).toBe(403);
  expect((await payouts.json()).message).toBe("You don't have access to this.");
});

test("hides the console from an anonymous caller and a marketplace token", async ({ page, request }) => {
  const hidden = await request.get(`${API_ORIGIN}/api/console/listings`);
  expect(hidden.status()).toBe(404);
  await login(page, DRIVER_EMAIL);
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  const bearer = await request.get(`${API_ORIGIN}/api/console/payouts`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(bearer.status()).toBe(404);
  await page.goto("/admin");
  await expect(page.getByText("404")).toBeVisible();
});
