import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../middleware/error.js";
import {
  EXPECTED_RAZORPAY_WEBHOOK_EVENTS,
  checkoutSignature,
  razorpayConfigured,
  razorpayOrderCreatePayload,
  razorpayRefundParams,
  settleRazorpayRefund,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  webhookSignature,
} from "./payments.js";
import { env } from "../config/env.js";

describe("Razorpay production webhook events", () => {
  it("lists the capture, failure, and refund events that production must enable", () => {
    assert.deepEqual([...EXPECTED_RAZORPAY_WEBHOOK_EVENTS], [
      "payment.captured",
      "order.paid",
      "payment.failed",
      "refund.processed",
      "refund.failed",
    ]);
  });
});

describe("Razorpay signature helpers", () => {
  it("accepts a matching checkout HMAC", () => {
    const secret = "test_checkout_secret";
    const sig = checkoutSignature("order_abc", "pay_xyz", secret);
    assert.equal(sig, checkoutSignature("order_abc", "pay_xyz", secret));
    assert.notEqual(sig, checkoutSignature("order_abc", "pay_OTHER", secret));
  });

  it("accepts a matching webhook HMAC over the raw body", () => {
    const secret = "test_webhook_secret";
    const raw = '{"event":"payment.captured"}';
    const sig = webhookSignature(raw, secret);
    assert.equal(sig, webhookSignature(raw, secret));
    assert.notEqual(sig, webhookSignature('{"event":"payment.failed"}', secret));
  });

  it("verifyRazorpaySignature rejects invalid and mismatched signatures", () => {
    if (!razorpayConfigured()) {
      assert.equal(verifyRazorpaySignature("order_1", "pay_1", "deadbeef"), false);
      return;
    }
    const good = checkoutSignature("order_1", "pay_1", env.RAZORPAY_KEY_SECRET);
    assert.equal(verifyRazorpaySignature("order_1", "pay_1", good), true);
    assert.equal(verifyRazorpaySignature("order_1", "pay_1", "0".repeat(good.length)), false);
    assert.equal(verifyRazorpaySignature("order_OTHER", "pay_1", good), false);
  });

  it("verifyWebhookSignature rejects when secret is missing or signature is wrong", () => {
    const raw = '{"event":"payment.captured"}';
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      assert.equal(verifyWebhookSignature(raw, "anything"), false);
      return;
    }
    const good = webhookSignature(raw, env.RAZORPAY_WEBHOOK_SECRET);
    assert.equal(verifyWebhookSignature(raw, good), true);
    assert.equal(verifyWebhookSignature(raw, "0".repeat(good.length)), false);
  });

  it("fails closed when the webhook secret is absent or only whitespace", () => {
    const prev = env.RAZORPAY_WEBHOOK_SECRET;
    const raw = '{"event":"payment.captured"}';
    try {
      env.RAZORPAY_WEBHOOK_SECRET = "";
      assert.equal(verifyWebhookSignature(raw, webhookSignature(raw, "")), false);
      env.RAZORPAY_WEBHOOK_SECRET = "   ";
      assert.equal(verifyWebhookSignature(raw, webhookSignature(raw, "   ")), false);
    } finally {
      env.RAZORPAY_WEBHOOK_SECRET = prev;
    }
  });
});

describe("Razorpay refund settlement", () => {
  it("creates orders with automatic capture so Test Mode payments can be refunded", () => {
    const payload = razorpayOrderCreatePayload("64b0f0f0f0f0f0f0f0f0f0f0", 7350);
    assert.equal(payload.amount, 7350);
    assert.equal(payload.currency, "INR");
    assert.equal(payload.payment_capture, true);
    assert.deepEqual(razorpayRefundParams(7350), { amount: 7350, speed: "normal" });
  });

  it("captures an authorized Test Mode payment before refunding at normal speed", async () => {
    const calls: string[] = [];
    const result = await settleRazorpayRefund({
      paymentId: "pay_auth_1",
      amountPaise: 7350,
      payments: {
        fetch: async (id) => {
          calls.push(`fetch:${id}`);
          return { status: "authorized" };
        },
        capture: async (id, amount, currency) => {
          calls.push(`capture:${id}:${amount}:${currency}`);
          return { status: "captured" };
        },
        refund: async (id, params) => {
          calls.push(`refund:${id}:${params.amount}:${params.speed}`);
          return { id: "rfnd_ok", status: "processed" };
        },
      },
    });
    assert.deepEqual(calls, ["fetch:pay_auth_1", "capture:pay_auth_1:7350:INR", "refund:pay_auth_1:7350:normal"]);
    assert.equal(result.refundId, "rfnd_ok");
    assert.equal(result.processed, true);
  });

  it("refunds an already captured payment without capturing again", async () => {
    const captures: string[] = [];
    const result = await settleRazorpayRefund({
      paymentId: "pay_cap_1",
      amountPaise: 1000,
      payments: {
        fetch: async () => ({ status: "captured" }),
        capture: async (id) => {
          captures.push(id);
          return {};
        },
        refund: async () => ({ id: "rfnd_cap", status: "pending" }),
      },
    });
    assert.deepEqual(captures, []);
    assert.equal(result.refundId, "rfnd_cap");
    assert.equal(result.processed, false);
  });

  it("resolves a missing payment id from the Razorpay order before refunding", async () => {
    const result = await settleRazorpayRefund({
      paymentId: "",
      orderId: "order_1",
      amountPaise: 7350,
      orders: {
        fetchPayments: async (orderId) => {
          assert.equal(orderId, "order_1");
          return { items: [{ id: "pay_from_order", status: "authorized" }] };
        },
      },
      payments: {
        fetch: async (id) => ({ id, status: "authorized" }),
        capture: async () => ({ status: "captured" }),
        refund: async (id) => ({ id: `rfnd_${id}`, status: "processed" }),
      },
    });
    assert.equal(result.refundId, "rfnd_pay_from_order");
  });

  it("times out a hung Razorpay refund call without treating it as success", async () => {
    await assert.rejects(
      () =>
        settleRazorpayRefund({
          paymentId: "pay_hang",
          amountPaise: 7350,
          timeoutMs: 20,
          payments: {
            fetch: async () => ({ status: "captured" }),
            capture: async () => ({}),
            refund: () => new Promise(() => undefined),
          },
        }),
      /timeout contacting Razorpay/
    );
  });

  it("maps Razorpay SDK object errors to the public 503 refund message", async () => {
    await assert.rejects(
      () =>
        settleRazorpayRefund({
          paymentId: "pay_bad",
          amountPaise: 7350,
          payments: {
            fetch: async () => ({ status: "captured" }),
            capture: async () => ({}),
            refund: async () => {
              throw { statusCode: 400, error: { description: "The payment is not captured and cannot be refunded" } };
            },
          },
        }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 503 &&
        err.message === "We couldn't process the refund. Try again shortly."
    );
  });
});
