import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, HOST_EMAIL, OTHER_HOST_EMAIL, SYNTHETIC_ACCOUNT, login } from "./support";

test.describe.serial("host journey", () => {
  test("opens listings, edits one, and reviews bookings", async ({ page }) => {
    await login(page, HOST_EMAIL);
    await page.goto("/host/listings/new");
    await expect(page.getByRole("heading", { name: "Where is your parking space?" })).toBeVisible();

    await page.goto("/host/listings");
    await expect(page.getByRole("heading", { name: "My listings" })).toBeVisible();
    await expect(page.getByText("Gated society parking, Pali Hill").first()).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
    const listed = await page.request.get("/api/host/listings", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(listed.ok()).toBeTruthy();
    const body = await listed.json();
    const match = (body.data.listings as { id: string; title: string }[]).find((row) =>
      row.title.includes("Gated society parking, Pali Hill")
    );
    expect(match?.id).toBeTruthy();

    await page.goto(`/host/listings/${match!.id}/edit`);
    await page.getByRole("button", { name: "Continue" }).click();
    const title = page.getByLabel("Listing title");
    await expect(title).toBeVisible();
    await title.fill("Gated society parking, Pali Hill e2e");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved.")).toBeVisible();
    await expect(page.getByText("Gated society parking, Pali Hill e2e").first()).toBeVisible();

    await page.goto("/host/bookings");
    await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  });

  test("stores synthetic payout details masked, and hides them from another host", async ({ page }) => {
    await login(page, HOST_EMAIL);
    await page.goto("/profile#bank-details");
    await page.getByRole("button", { name: "Add bank details" }).click();
    await page.locator("#bank-accountHolder").fill("Priya Sharma");
    await page.locator("#bank-bankName").fill("Example Bank");
    await page.locator("#bank-accountNumber").fill(SYNTHETIC_ACCOUNT);
    await page.locator("#bank-confirmAccountNumber").fill(SYNTHETIC_ACCOUNT);
    await page.locator("#bank-ifsc").fill("SBIN0001234");
    await page.getByRole("button", { name: "Save bank details" }).click();
    await expect(page.getByText(/XXXXXX1098/)).toBeVisible({ timeout: 40_000 });
    await expect(page.getByText(SYNTHETIC_ACCOUNT)).toHaveCount(0);

    await page.getByRole("link", { name: "Settings" }).first().click();
    await expect(page).toHaveURL(/\/settings/);
    await page.getByRole("navigation", { name: "Settings sections" }).getByRole("button", { name: "Payments" }).click();
    await expect(page.getByText(/Payout account ending 1098/)).toBeVisible();
    await expect(page.getByText(SYNTHETIC_ACCOUNT)).toHaveCount(0);

    const other = await page.request.post("/api/auth/login", {
      data: { email: OTHER_HOST_EMAIL, password: DEMO_PASSWORD },
    });
    expect(other.ok()).toBeTruthy();
    const otherToken = (await other.json()).data.token as string;
    const details = await page.request.get("/api/payout-details", {
      headers: { Authorization: `Bearer ${otherToken}` },
    });
    expect(details.status()).toBe(200);
    const raw = await details.text();
    expect(raw).not.toContain(SYNTHETIC_ACCOUNT);
    expect(raw).not.toContain("1098");
  });
});
