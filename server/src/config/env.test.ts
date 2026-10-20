import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertRazorpayWebhookSecret } from "./env.js";

describe("production webhook secret validation", () => {
  it("allows local development without a webhook secret", () => {
    assert.doesNotThrow(() => assertRazorpayWebhookSecret("development", ""));
    assert.doesNotThrow(() => assertRazorpayWebhookSecret("test", "   "));
  });

  it("requires a non-empty webhook secret in production", () => {
    assert.throws(
      () => assertRazorpayWebhookSecret("production", ""),
      (err: unknown) =>
        err instanceof Error &&
        err.message.includes("RAZORPAY_WEBHOOK_SECRET") &&
        !err.message.includes("whsec_") &&
        err.message === "RAZORPAY_WEBHOOK_SECRET is required in production."
    );
    assert.throws(() => assertRazorpayWebhookSecret("production", "   "));
  });

  it("accepts a configured production webhook secret without echoing it", () => {
    const secret = "whsec_unit_test_only";
    assert.doesNotThrow(() => assertRazorpayWebhookSecret("production", secret));
  });
});
