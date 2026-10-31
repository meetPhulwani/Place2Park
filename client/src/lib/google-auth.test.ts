import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { googleSignInResult } from "./google-auth.js";

describe("Google sign-in result", () => {
  it("keeps a new Google user on email verification and does not accept a session token", () => {
    const result = googleSignInResult({
      emailVerificationRequired: true,
      pendingToken: "pending-token",
      maskedEmail: "a****@gmail.com",
      expiresAt: "2026-11-01T00:05:00.000Z",
      resendAvailableAt: "2026-11-01T00:01:00.000Z",
      token: "should-not-be-used",
      user: { id: "user-1" },
    });
    assert.equal(result.kind, "email");
    if (result.kind === "email") assert.equal(result.challenge.pendingToken, "pending-token");
  });

  it("accepts a session only when email verification is not required", () => {
    const result = googleSignInResult({ token: "session", user: { id: "user-1" } });
    assert.equal(result.kind, "session");
  });
});
