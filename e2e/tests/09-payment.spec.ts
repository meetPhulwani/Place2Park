import { expect, test, type Page } from "@playwright/test";
import { API_ORIGIN, DRIVER_EMAIL, HOOK_HEADERS, login, nextSlot, tomorrowDate } from "./support";

const checkoutStub = `
window.Razorpay = class {
  constructor(options) { this.options = options; }
  open() {
    const mode = window.__e2eCheckoutMode || "success";
    const orderId = this.options.order_id;
    const paymentId = "pay_e2e_" + Math.random().toString(16).slice(2);
    if (mode === "cancel") { this.options.modal.ondismiss(); return; }
    if (mode === "fail") {
      this.options.handler({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: "${"00".repeat(32)}"
      });
      return;
    }
    const self = this;
    fetch("/api/__e2e/checkout-signature?orderId=" + encodeURIComponent(orderId) + "&paymentId=" + encodeURIComponent(paymentId), {
      headers: { "x-e2e-hook": "1" }
    }).then(function (response) { return response.json(); }).then(function (body) {
      self.options.handler({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: body.data.signature
      });
    });
  }
};
`;

async function tokenOf(page: Page) {
  const token = await page.evaluate(() => localStorage.getItem("parkly_token"));
  expect(token).toBeTruthy();
  return token as string;
}

async function book(page: Page) {
  const token = await tokenOf(page);
  const search = await page.request.get(`${API_ORIGIN}/api/parking/search?lat=19.0607&lng=72.8329`);
  expect(search.ok()).toBeTruthy();
  const results = (await search.json()).data.results as Array<{ id: string }>;
  const start = `${tomorrowDate()}T${nextSlot()}:00`;
  for (const space of results.slice(0, 12)) {
    const response = await page.request.post(`${API_ORIGIN}/api/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        spaceId: space.id,
        start,
        durationMins: 60,
        vehicleType: "CAR",
        vehiclePlate: "E2E1234",
      },
    });
    if (response.ok()) return (await response.json()).data.bookingId as string;
  }
  throw new Error("No parking space accepted the reservation.");
}

async function state(page: Page, bookingId: string) {
  const response = await page.request.get(`${API_ORIGIN}/api/__e2e/booking/${bookingId}`, { headers: HOOK_HEADERS });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).data as {
    status: string;
    paymentStatus: string;
    orderId: string;
    amount: number;
  };
}

async function stubCheckout(page: Page, mode: "success" | "fail" | "cancel") {
  const live: string[] = [];
  await page.addInitScript((value) => {
    (window as unknown as { __e2eCheckoutMode?: string }).__e2eCheckoutMode = value;
  }, mode);
  await page.route("**://api.razorpay.com/**", (route) => {
    live.push(route.request().url());
    return route.abort();
  });
  await page.route("https://checkout.razorpay.com/**", (route) =>
    route.fulfill({ status: 200, contentType: "application/javascript", body: checkoutStub })
  );
  return live;
}

async function webhook(page: Page, raw: string, signature: string) {
  return page.request.post(`${API_ORIGIN}/api/payments/webhook`, {
    headers: { "content-type": "application/json", "x-razorpay-signature": signature },
    data: raw,
  });
}

test.describe("local checkout", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, DRIVER_EMAIL);
  });

  test("confirms a booking only after the server accepts the signature", async ({ page }) => {
    const live = await stubCheckout(page, "success");
    const bookingId = await book(page);
    await page.goto(`/bookings/${bookingId}`);
    await page.getByRole("button", { name: "Pay now" }).click();
    await expect(page.getByText("PAYMENT_PAID")).toBeVisible();
    await expect(page.getByText(/pay_e2e_/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Pay now" })).toHaveCount(0);
    await expect(page).not.toHaveURL(/razorpay\.com/);
    const paid = await state(page, bookingId);
    expect(paid.status).toBe("CONFIRMED");
    expect(paid.paymentStatus).toBe("PAID");
    expect(live).toEqual([]);
  });

  test("leaves the booking unpaid when the signature is invalid", async ({ page }) => {
    await stubCheckout(page, "fail");
    const bookingId = await book(page);
    await page.goto(`/bookings/${bookingId}`);
    await page.getByRole("button", { name: "Pay now" }).click();
    await expect(page.getByRole("alert")).toHaveText(/payment verification failed/i);
    const unpaid = await state(page, bookingId);
    expect(unpaid.status).toBe("PENDING");
    expect(unpaid.paymentStatus).not.toBe("PAID");
  });

  test("leaves the booking unpaid when checkout is closed", async ({ page }) => {
    await stubCheckout(page, "cancel");
    const bookingId = await book(page);
    await page.goto(`/bookings/${bookingId}`);
    await page.getByRole("button", { name: "Pay now" }).click();
    await expect(page.getByText("Checkout closed. Your reservation is still unpaid.")).toBeVisible();
    const unpaid = await state(page, bookingId);
    expect(unpaid.status).toBe("PENDING");
    expect(unpaid.paymentStatus).not.toBe("PAID");
  });

  test("accepts one captured webhook twice and rejects a bad signature", async ({ page }) => {
    const bookingId = await book(page);
    const current = await state(page, bookingId);
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_e2e_webhook_${bookingId.slice(-6)}`,
            order_id: current.orderId,
            amount: current.amount,
            currency: "INR",
          },
        },
      },
    });
    const signed = await page.request.post(`${API_ORIGIN}/api/__e2e/webhook-signature`, {
      headers: HOOK_HEADERS,
      data: { raw },
    });
    expect(signed.ok()).toBeTruthy();
    const signature = (await signed.json()).data.signature as string;
    const first = await webhook(page, raw, signature);
    const second = await webhook(page, raw, signature);
    expect(first.ok()).toBeTruthy();
    expect(second.ok()).toBeTruthy();
    const paid = await state(page, bookingId);
    expect(paid.status).toBe("CONFIRMED");
    expect(paid.paymentStatus).toBe("PAID");

    const otherId = await book(page);
    const otherBefore = await state(page, otherId);
    const invalidRaw = JSON.stringify({
      event: "payment.captured",
      payload: {
        payment: {
          entity: {
            id: `pay_e2e_invalid_${otherId.slice(-6)}`,
            order_id: otherBefore.orderId,
            amount: otherBefore.amount,
            currency: "INR",
          },
        },
      },
    });
    const rejected = await webhook(page, invalidRaw, "00".repeat(32));
    expect(rejected.status()).toBe(400);
    const other = await state(page, otherId);
    expect(other.status).toBe("PENDING");
    expect(other.paymentStatus).not.toBe("PAID");
  });

  test("refuses the mock confirm route", async ({ page }) => {
    const denied = await page.request.post(`${API_ORIGIN}/api/payments/mock-confirm`, {
      headers: { Authorization: `Bearer ${await tokenOf(page)}` },
      data: {},
    });
    expect(denied.status()).toBe(403);
  });
});
