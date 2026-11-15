import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { API_ORIGIN, DRIVER_EMAIL, HOST_EMAIL, HOOK_HEADERS, login } from "./support";

type Fixture = {
  spaceId: string;
  reviewBookingId: string;
  arrivalBookingId: string;
  arrivalCode: string;
  vehiclePlate: string;
  accessCode: string;
  declineBookingId: string;
  declineCode: string;
  declinePlate: string;
  declineAccessCode: string;
};

async function authHeaders(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  return { Authorization: `Bearer ${token}` };
}

async function pending(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`${API_ORIGIN}/api/reviews/pending`, { headers });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as {
    skipCount: number;
    skipsRemaining: number;
    blocked: boolean;
    requests: { bookingId: string; authorRole: string }[];
  };
}

test.describe.serial("reviews and vehicle checks", () => {
  test.setTimeout(180_000);
  let fixture: Fixture;

  test.beforeAll(async ({ request }) => {
    const response = await request.post(`${API_ORIGIN}/api/__e2e/fixtures/reviews`, { headers: HOOK_HEADERS });
    expect(response.ok()).toBeTruthy();
    fixture = (await response.json()).data as Fixture;
  });

  test.afterAll(async ({ request }) => {
    await request.post(`${API_ORIGIN}/api/__e2e/fixtures/reviews/reset`, { headers: HOOK_HEADERS });
  });

  test("shows the driver question and does not count a close or refresh as a skip", async ({ page }) => {
    await login(page, DRIVER_EMAIL);
    await page.goto("/bookings");
    const prompt = page.getByRole("heading", { name: "How was your parking experience?" });
    await expect(prompt).toBeVisible();
    const headers = await authHeaders(page);
    const before = await pending(page.request, headers);
    const notices = await page.request.get(`${API_ORIGIN}/api/notifications`, { headers });
    expect(notices.ok()).toBeTruthy();
    const titles = ((await notices.json()).data.notifications as { title: string }[]).map((row) => row.title);
    expect(titles).toContain("How was your parking experience?");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(prompt).toHaveCount(0);
    await page.reload();
    await expect(prompt).toBeVisible();
    const after = await pending(page.request, headers);
    expect(after.skipCount).toBe(before.skipCount);
  });

  test("allows three skips, then keeps settings, support, and cancellation open", async ({ page }) => {
    await login(page, DRIVER_EMAIL);
    const headers = await authHeaders(page);
    for (let i = 0; i < 3; i += 1) {
      await page.goto("/bookings");
      await page.getByRole("button", { name: "Skip for now" }).click();
      await expect(page.getByRole("heading", { name: "How was your parking experience?" })).toHaveCount(0);
    }
    await page.goto("/bookings");
    await expect(page.getByRole("button", { name: "Skip for now" })).toHaveCount(0);
    await expect(page.getByText(/Submit your pending review/i)).toBeVisible();
    const state = await pending(page.request, headers);
    expect(state.skipCount).toBe(3);
    expect(state.blocked).toBe(true);

    const blocked = await page.request.post(`${API_ORIGIN}/api/bookings`, {
      headers,
      data: {
        spaceId: "507f1f77bcf86cd799439011",
        start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        durationMins: 60,
        vehicleType: "CAR",
        vehiclePlate: "TEST1234",
      },
    });
    expect(blocked.status()).toBe(409);

    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account", exact: true })).toBeVisible();
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: /help/i }).first()).toBeVisible();

    const bookings = await page.request.get(`${API_ORIGIN}/api/bookings`, { headers });
    const rows = (await bookings.json()).data.bookings as { id: string; status: string }[];
    const confirmed = rows.find((row) => row.status === "CONFIRMED");
    expect(confirmed?.id).toBeTruthy();
    await page.goto(`/bookings/${confirmed!.id}`);
    await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  });

  test("submitting the driver review lifts the booking restriction", async ({ page }) => {
    await login(page, DRIVER_EMAIL);
    await page.goto("/bookings");
    await page.getByRole("radiogroup", { name: "Rating" }).first().getByRole("radio", { name: "5 stars" }).click();
    await page.getByLabel(/Written review/).fill("Clear access and a safe spot.");
    await page.getByRole("button", { name: "Submit review" }).click();
    await expect(page.getByText("Thanks — your review was saved.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "How was your parking experience?" })).toHaveCount(0);

    const headers = await authHeaders(page);
    const state = await pending(page.request, headers);
    expect(state.blocked).toBe(false);
    const retry = await page.request.post(`${API_ORIGIN}/api/bookings`, {
      headers,
      data: {
        spaceId: "507f1f77bcf86cd799439011",
        start: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        durationMins: 60,
        vehicleType: "CAR",
        vehiclePlate: "TEST1234",
      },
    });
    expect(retry.status()).toBe(404);
  });

  test("shows the host question and keeps that review off the public listing", async ({ page }) => {
    await login(page, HOST_EMAIL);
    await page.goto("/host");
    await expect(page.getByRole("heading", { name: "How was your experience with this driver?" })).toBeVisible();
    const headers = await authHeaders(page);
    const notices = await page.request.get(`${API_ORIGIN}/api/notifications`, { headers });
    const titles = ((await notices.json()).data.notifications as { title: string }[]).map((row) => row.title);
    expect(titles).toContain("How was your experience with this driver?");
    const before = await pending(page.request, headers);
    const shown = before.requests[0];
    expect(shown?.authorRole).toBe("HOST");

    await page.getByRole("radiogroup", { name: "Rating" }).first().getByRole("radio", { name: "4 stars" }).click();
    await page.getByLabel(/Written review/).fill("Private note about the driver");
    const submitted = page.waitForResponse((response) => response.url().endsWith("/api/reviews") && response.request().method() === "POST");
    await page.getByRole("button", { name: "Submit review" }).scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Submit review" }).click();
    expect((await submitted).ok()).toBeTruthy();
    const state = await pending(page.request, headers);
    expect(state.requests.some((row) => row.bookingId === shown?.bookingId)).toBe(false);

    const detail = await page.request.get(`${API_ORIGIN}/api/bookings/${shown?.bookingId}`, { headers });
    expect(detail.ok()).toBeTruthy();
    const space = (await detail.json()).data.booking.spaceId as { id?: string } | string;
    const spaceId = typeof space === "string" ? space : space.id;
    const listing = await page.request.get(`${API_ORIGIN}/api/parking/${spaceId}`);
    expect(listing.ok()).toBeTruthy();
    const reviews = (await listing.json()).data.reviews as { comment?: string }[];
    expect(reviews.some((review) => review.comment?.includes("Private note about the driver"))).toBe(false);
  });

  test("requires a current vehicle confirmation before the access code", async ({ page }) => {
    await login(page, HOST_EMAIL);
    const headers = await authHeaders(page);
    const early = await page.request.post(`${API_ORIGIN}/api/host/bookings/${fixture.arrivalBookingId}/access-code`, {
      headers,
      data: { code: fixture.accessCode },
    });
    expect(early.status()).toBe(409);

    await page.goto("/host/bookings");
    const row = page.locator("tr", { hasText: fixture.arrivalCode });
    await row.getByRole("button", { name: "Enter OTP" }).scrollIntoViewIfNeeded();
    await row.getByRole("button", { name: "Enter OTP" }).click();
    await expect(page.getByText(fixture.vehiclePlate, { exact: true })).toBeVisible();
    await expect(page.getByText(`Does the arriving vehicle number match ${fixture.vehiclePlate}?`)).toBeVisible();
    await page.getByRole("button", { name: "Yes, it matches" }).click();
    await page.getByLabel("Access code").fill(fixture.accessCode);
    await page.getByRole("button", { name: "Check code" }).click();
    await expect(page.getByText(/The code matches/i)).toBeVisible();
  });

  test("warns on a mismatch, allows a decline, and requires a separate override", async ({ page }) => {
    await login(page, HOST_EMAIL);
    const headers = await authHeaders(page);
    await page.goto("/host/bookings");
    const row = page.locator("tr", { hasText: fixture.declineCode });
    await row.getByRole("button", { name: "Enter OTP" }).scrollIntoViewIfNeeded();
    await row.getByRole("button", { name: "Enter OTP" }).click();
    await expect(page.getByText(fixture.declinePlate, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "No, it doesn't match" }).click();
    await expect(page.getByRole("alert")).toContainText(/recommends not accepting/i);
    await page.getByRole("button", { name: "Go back / do not accept" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const declined = await page.request.post(`${API_ORIGIN}/api/host/bookings/${fixture.declineBookingId}/access-code`, {
      headers,
      data: { code: fixture.declineAccessCode },
    });
    expect(declined.status()).toBe(409);

    await row.getByRole("button", { name: "Enter OTP" }).click();
    await page.getByRole("button", { name: "No, it doesn't match" }).click();
    await page.getByRole("button", { name: "Continue at my own risk" }).click();
    const confirm = page.getByRole("button", { name: "Confirm and continue" });
    await expect(confirm).toBeDisabled();
    await page.getByRole("checkbox").check();
    await confirm.click();
    await expect(page.getByLabel("Access code")).toBeVisible();

    const again = await page.request.post(`${API_ORIGIN}/api/host/bookings/${fixture.declineBookingId}/vehicle-check`, {
      headers,
      data: { decision: "MISMATCH_OVERRIDE", acknowledgement: "I ACCEPT THE RISK" },
    });
    expect(again.ok()).toBeTruthy();
    const audit = await page.request.get(`${API_ORIGIN}/api/__e2e/fixtures/vehicle-audit?bookingId=${fixture.declineBookingId}`, {
      headers: HOOK_HEADERS,
    });
    expect(audit.ok()).toBeTruthy();
    const auditBody = (await audit.json()).data as { audits: number; leaked: boolean };
    expect(auditBody.audits).toBe(1);
    expect(auditBody.leaked).toBe(false);

    const moved = await page.request.post(`${API_ORIGIN}/api/__e2e/fixtures/vehicle-plate`, {
      headers: HOOK_HEADERS,
      data: { bookingId: fixture.declineBookingId, plate: "DL01ZZ0001" },
    });
    expect(moved.ok()).toBeTruthy();
    const stale = await page.request.post(`${API_ORIGIN}/api/host/bookings/${fixture.declineBookingId}/access-code`, {
      headers,
      data: { code: fixture.declineAccessCode },
    });
    expect(stale.status()).toBe(409);
  });
});
