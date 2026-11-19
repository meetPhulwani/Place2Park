import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { digitsOnly, isChallengeExpired, resendWaitMs } from "./otp";

describe("email code timing", () => {
  it("keeps the resend cooldown and treats an expired code as unusable", () => {
    const now = Date.parse("2026-11-19T17:45:30.000Z");
    assert.equal(resendWaitMs("2026-11-19T17:46:00.000Z", now), 30_000);
    assert.equal(resendWaitMs("2026-11-19T17:45:00.000Z", now), 0);
    assert.equal(isChallengeExpired("2026-11-19T17:45:00.000Z", now), true);
    assert.equal(isChallengeExpired("2026-11-19T18:00:00.000Z", now), false);
  });

  it("accepts a pasted code", () => {
    assert.equal(digitsOnly("12 34-56 78"), "123456");
  });
});
