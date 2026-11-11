import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, DRIVER_EMAIL } from "./support";

test("the public /admin route is not the console", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByText("404")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go Home" })).toBeVisible();
});

test("console, payout, and audit routes stay hidden without a console session", async ({ request }) => {
  const hidden = ["/api/console/auth/session", "/api/console/listings", "/api/console/payouts", "/api/console/audits"];
  for (const path of hidden) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body).toMatchObject({ success: false, message: "Not found." });
  }

  const login = await request.post("/api/auth/login", {
    data: { email: DRIVER_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).data.token as string;
  const moderate = await request.post("/api/console/listings/000000000000000000000000/moderate", {
    headers: { Authorization: `Bearer ${token}` },
    data: { action: "approve" },
  });
  expect(moderate.status()).toBe(404);
  const payouts = await request.get("/api/console/payouts", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(payouts.status()).toBe(404);
});

test("a driver cannot read host payout details", async ({ request }) => {
  const login = await request.post("/api/auth/login", {
    data: { email: DRIVER_EMAIL, password: DEMO_PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).data.token as string;
  const details = await request.get("/api/payout-details", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(details.status()).toBe(403);
});
