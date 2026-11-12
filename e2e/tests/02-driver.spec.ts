import { expect, test } from "@playwright/test";
import { DRIVER_EMAIL, login, tomorrowDate } from "./support";

test.describe.serial("driver journey", () => {
  test.setTimeout(120_000);
  test("logs in, searches, saves a listing, and reserves without paying", async ({ page }) => {
    await login(page, DRIVER_EMAIL);
    await page.goto("/search?lat=19.0607&lng=72.8329&q=Bandra");
    const listing = page.getByRole("link", { name: /Covered basement spot near Bandra Linking Road/i }).first();
    await expect(listing).toBeVisible();
    await listing.click();
    await expect(page).toHaveURL(/\/parking\//);

    const saved = page.getByRole("button", { name: "Remove from saved" });
    const unsaved = page.getByRole("button", { name: "Save this parking space" });
    await expect(saved.or(unsaved)).toBeVisible();
    if (await saved.isVisible()) {
      await saved.click();
      await expect(unsaved).toBeVisible();
      await unsaved.click();
      await expect(saved).toBeVisible();
    } else {
      await unsaved.click();
      await expect(saved).toBeVisible();
      await saved.click();
      await expect(unsaved).toBeVisible();
    }

    await page.locator("#bk-date").fill(tomorrowDate());
    await page.locator("#bk-time").fill("10:00");
    await page.locator("#bk-vehicle-number").fill("TEST1234");
    const reserve = page.getByRole("button", { name: "Reserve this spot" });
    await expect(reserve).toBeEnabled();
    await reserve.click();
    await expect(page).toHaveURL(/\/bookings\/[a-f0-9]{24}/i);
    await expect(page.getByRole("button", { name: /pay/i })).toBeVisible();
    await expect(page).not.toHaveURL(/razorpay\.com/);

    await page.goto("/bookings");
    await expect(page.getByText(/Covered basement spot near Bandra Linking Road/i).first()).toBeVisible();
    await page.goto("/history");
    await expect(page).toHaveURL(/\/bookings/);
    await expect(page.getByRole("heading", { name: "My bookings" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  });

  test("updates profile and settings without leaving the account", async ({ page }) => {
    await login(page, DRIVER_EMAIL);
    await page.goto("/profile");
    await expect(page.getByRole("button", { name: "Delete account" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add bank details" })).toHaveCount(0);
    const name = page.getByLabel("Full name");
    await expect(name).toHaveValue("Aarav Mehta");
    await name.fill("Aarav Mehta");
    await page.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible();

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await expect(page.getByText("Joined")).toBeVisible();
    await page.getByRole("button", { name: "Security" }).click();
    await expect(page.getByLabel("Current password")).toBeVisible();
    await page.getByRole("button", { name: "Notifications" }).click();
    await expect(page.getByRole("switch", { name: "Booking reminders" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Privacy" }).click();
    const marketing = page.getByRole("switch", { name: "Marketing email" });
    const before = await marketing.getAttribute("aria-checked");
    await marketing.click();
    await expect(marketing).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    await page.getByRole("button", { name: "Payments" }).click();
    await expect(page.getByText(/Card numbers are entered at checkout/i)).toBeVisible();
    await expect(page.getByText(/Payout account/i)).toHaveCount(0);
  });
});
