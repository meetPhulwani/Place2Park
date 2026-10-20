import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkoutSignature,
  razorpayConfigured,
  verifyRazorpaySignature,
  verifyWebhookSignature,
  webhookSignature,
} from "./payments.js";
import { env } from "../config/env.js";

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
