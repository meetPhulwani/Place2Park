import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertPayoutEncryptionKey, assertRazorpayWebhookSecret, unwrapEnvValue } from "./env.js";

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

  it("strips quotes pasted around a Render env value", () => {
    assert.equal(unwrapEnvValue('  "Place2Park <hello@place2park.app>"  '), "Place2Park <hello@place2park.app>");
    assert.equal(unwrapEnvValue("'re_test_secret'"), "re_test_secret");
    assert.equal(unwrapEnvValue("plain-value"), "plain-value");
    assert.equal(unwrapEnvValue(""), "");
    assert.equal(unwrapEnvValue('"mismatched\''), '"mismatched\'');
  });

  it("requires a dedicated payout encryption key only in production", () => {
    assert.doesNotThrow(() => assertPayoutEncryptionKey("development", ""));
    assert.throws(
      () => assertPayoutEncryptionKey("production", "short"),
      (err: unknown) => err instanceof Error && err.message === "PAYOUT_ENCRYPTION_KEY must be at least 32 characters in production."
    );
    assert.doesNotThrow(() => assertPayoutEncryptionKey("production", "x".repeat(32)));
  });

  it("accepts a configured production webhook secret without echoing it", () => {
    const secret = "whsec_unit_test_only";
    assert.doesNotThrow(() => assertRazorpayWebhookSecret("production", secret));
  });
});
