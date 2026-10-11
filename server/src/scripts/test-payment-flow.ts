/**
 * Live API checks for Razorpay order + verify security.
 * Run: npx tsx src/scripts/test-payment-flow.ts
 */
import { checkoutSignature } from "../services/payments.js";
import { env } from "../config/env.js";

const BASE = process.env.API_URL ?? "http://localhost:5000/api";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];

function record(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function req(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    message?: string;
    data?: Record<string, unknown>;
  };
  return { status: res.status, json };
}

function atHour(daysAhead: number, hour: number) {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function login(email: string) {
  const res = await req("/auth/login", { method: "POST", body: { email, password: "password123" } });
  return (res.json.data as { token?: string } | undefined)?.token;
}

function dumpedSecret(payload: unknown) {
  const text = JSON.stringify(payload);
  return /key_secret|KEY_SECRET|webhook_secret/i.test(text);
}

async function main() {
  const driverToken = await login("driver@parkly.dev");
  const otherToken = await login("kabir@parkly.dev");
  record("driver login", !!driverToken);
  record("other driver login", !!otherToken);
  if (!driverToken || !otherToken) process.exit(1);

  const search = await req("/parking/search?q=Shahad&lat=19.2478&lng=73.1589&radius=12");
  const listings = (search.json.data?.results as { id: string }[] | undefined) ?? [];
  const spaceId = listings[0]?.id;
  record("listing available for payment test", !!spaceId, `${listings.length} spaces`);
  if (!spaceId) process.exit(1);

  let created = await req("/bookings", {
    method: "POST",
    token: driverToken,
    body: { spaceId, start: atHour(9, 15).toISOString(), durationMins: 60, vehicleType: "CAR" },
  });
  for (let extra = 1; extra < 5 && created.status !== 201; extra++) {
    created = await req("/bookings", {
      method: "POST",
      token: driverToken,
      body: { spaceId, start: atHour(9 + extra, 15).toISOString(), durationMins: 60, vehicleType: "CAR" },
    });
  }
  const bookingId = created.json.data?.bookingId as string | undefined;
  record("creates unpaid PENDING booking", created.status === 201 && created.json.data?.status === "PENDING", created.json.message);
  if (!bookingId) process.exit(1);

  const unauthOrder = await req("/payments/orders", { method: "POST", body: { bookingId } });
  record("create order requires auth", unauthOrder.status === 401 || unauthOrder.status === 403);

  const otherOrder = await req("/payments/orders", { method: "POST", token: otherToken, body: { bookingId } });
  record("other user cannot create an order", otherOrder.status === 404 || otherOrder.status === 403, otherOrder.json.message);

  const order = await req("/payments/orders", { method: "POST", token: driverToken, body: { bookingId } });
  const orderData = (order.json.data ?? {}) as {
    orderId?: string;
    keyId?: string;
    amount?: number;
    currency?: string;
    key_secret?: string;
  };
  record(
    "creates Razorpay test order from Mongo amount",
    order.status === 201 &&
      typeof orderData.orderId === "string" &&
      orderData.orderId.startsWith("order_") &&
      typeof orderData.keyId === "string" &&
      orderData.keyId.startsWith("rzp_") &&
      orderData.currency === "INR" &&
      !dumpedSecret(order.json),
    `status=${order.status} ${order.json.message ?? ""}`
  );

  const reuse = await req("/payments/orders", { method: "POST", token: driverToken, body: { bookingId } });
  record(
    "retries reuse the same Razorpay order",
    reuse.status === 201 && reuse.json.data?.orderId === orderData.orderId
  );

  const clientAmount = await req("/payments/orders", {
    method: "POST",
    token: driverToken,
    body: { bookingId, amount: 1, totalAmount: 1 },
  });
  record(
    "ignores client-supplied amount",
    clientAmount.status === 201 && clientAmount.json.data?.amount === orderData.amount
  );

  const badSig = await req("/payments/verify", {
    method: "POST",
    token: driverToken,
    body: {
      bookingId,
      razorpayOrderId: orderData.orderId,
      razorpayPaymentId: "pay_test_invalid",
      razorpaySignature: "a".repeat(64),
    },
  });
  record("rejects invalid signature", badSig.status === 400, badSig.json.message);

  const wrongOrder = await req("/payments/verify", {
    method: "POST",
    token: driverToken,
    body: {
      bookingId,
      razorpayOrderId: "order_not_this_booking",
      razorpayPaymentId: "pay_test",
      razorpaySignature: "b".repeat(64),
    },
  });
  record("rejects mismatched order id", wrongOrder.status === 400, wrongOrder.json.message);

  const otherVerify = await req("/payments/verify", {
    method: "POST",
    token: otherToken,
    body: {
      bookingId,
      razorpayOrderId: orderData.orderId,
      razorpayPaymentId: "pay_test",
      razorpaySignature: "c".repeat(64),
    },
  });
  record("rejects verify from another user", otherVerify.status === 404 || otherVerify.status === 403);

  const stillPending = await req(`/bookings/${bookingId}`, { token: driverToken });
  const pendingStatus = (stillPending.json.data?.booking as { status?: string } | undefined)?.status;
  const pendingPay = (stillPending.json.data?.payment as { status?: string } | undefined)?.status;
  record(
    "failed verify does not confirm the booking",
    pendingStatus === "PENDING" && pendingPay !== "PAID",
    `booking=${pendingStatus} payment=${pendingPay}`
  );

  const mockPay = await req("/payments/mock-confirm", {
    method: "POST",
    token: driverToken,
    body: { bookingId, outcome: "success" },
  });
  record("mock confirm cannot mark paid", mockPay.status === 403, mockPay.json.message);

  const webhookBad = await req("/payments/webhook", {
    method: "POST",
    body: { event: "payment.captured", payload: { payment: { entity: { id: "pay_x", order_id: orderData.orderId } } } },
  });
  record("webhook rejects missing/invalid signature", webhookBad.status === 400);

  if (env.RAZORPAY_KEY_SECRET && orderData.orderId) {
    const paymentId = `pay_flow_${Date.now()}`;
    const signature = checkoutSignature(orderData.orderId, paymentId, env.RAZORPAY_KEY_SECRET);
    const verified = await req("/payments/verify", {
      method: "POST",
      token: driverToken,
      body: {
        bookingId,
        razorpayOrderId: orderData.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    record("valid signature confirms the booking", verified.status === 200, verified.json.message);

    const after = await req(`/bookings/${bookingId}`, { token: driverToken });
    const afterBooking = after.json.data?.booking as { status?: string } | undefined;
    const afterPay = after.json.data?.payment as { status?: string } | undefined;
    record(
      "booking is CONFIRMED and payment PAID after verify",
      afterBooking?.status === "CONFIRMED" && afterPay?.status === "PAID",
      `booking=${afterBooking?.status} payment=${afterPay?.status}`
    );

    const again = await req("/payments/verify", {
      method: "POST",
      token: driverToken,
      body: {
        bookingId,
        razorpayOrderId: orderData.orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    });
    record("duplicate verify is idempotent", again.status === 200 && again.json.data?.alreadyPaid === true);

    const paidOrder = await req("/payments/orders", { method: "POST", token: driverToken, body: { bookingId } });
    record("paid booking cannot create another order", paidOrder.status === 409, paidOrder.json.message);

    await req(`/bookings/${bookingId}/cancel`, { method: "POST", token: driverToken });
  } else {
    record("valid signature confirms the booking", false, "RAZORPAY_KEY_SECRET missing in test process");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
