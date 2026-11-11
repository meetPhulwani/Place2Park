import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_ORIGIN, HOOK_HEADERS } from "./support";

const PASSWORD = "E2eSignup1!ok";

function person() {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  return {
    email: `e2e.delete.${stamp}@place2park.test`,
    phone: `8${stamp.slice(-9)}`,
  };
}

async function verifiedAccount(page: Page, email: string, phone: string) {
  await page.goto("/signup");
  await page.getByRole("radio", { name: /Find parking/ }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Full name").fill("Disposable Driver");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contact number").fill(phone);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Re-enter password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/signup\/verify-email/);
  const mailbox = await page.request.get(`${API_ORIGIN}/api/__e2e/mailbox?email=${encodeURIComponent(email)}`, {
    headers: HOOK_HEADERS,
  });
  expect(mailbox.ok()).toBeTruthy();
  const code = (await mailbox.json()).data.code as string;
  await page.getByLabel("Verification code").fill(code);
  await page.getByRole("button", { name: "Verify OTP" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

async function userId(request: APIRequestContext, page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  const me = await request.get(`${API_ORIGIN}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(me.ok()).toBeTruthy();
  return (await me.json()).data.user.id as string;
}

test("deletes a disposable account and keeps the financial records", async ({ page }) => {
  test.setTimeout(120_000);
  const { email, phone } = person();
  await verifiedAccount(page, email, phone);
  const id = await userId(page.request, page);
  const history = await page.request.post(`${API_ORIGIN}/api/__e2e/fixtures/history`, {
    headers: HOOK_HEADERS,
    data: { userId: id },
  });
  expect(history.ok()).toBeTruthy();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Continue to Delete Account" }).click();
  const phrase = page.locator("#delete-phrase");
  const submit = page.getByRole("dialog").getByRole("button", { name: "Delete account" });
  await expect(submit).toBeDisabled();

  await phrase.focus();
  await page.keyboard.press("Control+v");
  await phrase.evaluate((element) => {
    const data = new DataTransfer();
    data.setData("text/plain", "CONFIRM");
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: data }));
  });
  await expect(phrase).toHaveValue("");

  await phrase.pressSequentially("confirm", { delay: 40 });
  await expect(phrase).toHaveValue("confirm");
  await expect(submit).toBeDisabled();
  await phrase.fill("");
  await phrase.pressSequentially("CONFIRM", { delay: 40 });
  await expect(phrase).toHaveValue("CONFIRM");
  await expect(submit).toBeDisabled();
  await page.locator("#delete-password").fill(PASSWORD);
  await expect(submit).toBeEnabled();
  const [deleted] = await Promise.all([
    page.waitForResponse((response) => response.url().includes("/account/delete")),
    submit.click(),
  ]);
  expect(deleted.ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  expect(token).toBeNull();

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText(/incorrect email or password/i)).toBeVisible();

  const retained = await page.request.get(`${API_ORIGIN}/api/__e2e/retention/${id}`, { headers: HOOK_HEADERS });
  expect(retained.ok()).toBeTruthy();
  const body = await retained.json();
  expect(body.data.status).toBe("DELETED");
  expect(body.data.bookings).toBeGreaterThan(0);
  expect(body.data.payments).toBeGreaterThan(0);
  expect(body.data.audits).toBeGreaterThan(0);
  expect(JSON.stringify(body)).not.toContain(email);
});
