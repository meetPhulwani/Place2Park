import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError, type ApiClient } from "./client";
import { fetchCurrentUser, loginWithPassword, parseGoogleStart, parseLoginChallenge, parseSignupChallenge, requestPasswordReset, resendEmailCode, signupAccount, startGoogleSignIn, submitPasswordReset, verifyEmailCode } from "./auth";

const challenge = {
  emailVerificationRequired: true,
  purpose: "login",
  kind: "email",
  pendingToken: "pending-token-value-123456",
  maskedEmail: "a***@place2park.test",
  expiresAt: "2026-11-19T18:00:00.000Z",
  resendAvailableAt: "2026-11-19T17:46:00.000Z",
  token: "this-must-not-become-the-session",
};

function client(handler: (path: string, body: unknown) => unknown): ApiClient {
  return {
    async request(path, options) {
      return handler(path, options?.body) as never;
    },
  };
}

describe("auth API", () => {
  it("treats login as an email challenge and ignores any token field", () => {
    const parsed = parseLoginChallenge(challenge);
    assert.equal(parsed.pendingToken, challenge.pendingToken);
    assert.equal(parsed.purpose, "login");
    assert.equal("token" in parsed, false);
  });

  it("rejects a login payload that is already a session", () => {
    assert.throws(
      () => parseLoginChallenge({ token: "jwt", user: { id: "1" } }),
      (err: unknown) => err instanceof ApiRequestError && /email code challenge/.test(err.message)
    );
  });

  it("logs in, verifies the code, and resends with the same pending token", async () => {
    const calls: string[] = [];
    const api = client((path, body) => {
      calls.push(path);
      if (path === "/auth/login") return challenge;
      if (path === "/auth/email-otp/verify") {
        assert.deepEqual(body, { pendingToken: challenge.pendingToken, otp: "123456" });
        return {
          token: "access-jwt-value-1234567890",
          user: { id: "abc", name: "Asha", email: "asha@place2park.test", role: "DRIVER", status: "ACTIVE" },
        };
      }
      if (path === "/auth/email-otp/resend") {
        assert.deepEqual(body, { pendingToken: challenge.pendingToken });
        return {
          maskedEmail: challenge.maskedEmail,
          expiresAt: "2026-11-19T18:05:00.000Z",
          resendAvailableAt: "2026-11-19T17:47:00.000Z",
        };
      }
      throw new Error(path);
    });

    const pending = await loginWithPassword(api, "asha@place2park.test", "secret");
    const session = await verifyEmailCode(api, pending.pendingToken, "123456");
    const resent = await resendEmailCode(api, pending);
    assert.equal(session.token, "access-jwt-value-1234567890");
    assert.equal(session.user.email, "asha@place2park.test");
    assert.equal(resent.pendingToken, pending.pendingToken);
    assert.deepEqual(calls, ["/auth/login", "/auth/email-otp/verify", "/auth/email-otp/resend"]);
  });

  it("reads the current user and surfaces invalid credentials", async () => {
    const api = client(() => ({ user: { id: "abc", name: "Asha", email: "asha@place2park.test", role: "DRIVER", status: "ACTIVE" } }));
    const user = await fetchCurrentUser(api);
    assert.equal(user.id, "abc");

    const failing: ApiClient = {
      async request() {
        throw new ApiRequestError("Incorrect email or password.", 401);
      },
    };
    await assert.rejects(() => loginWithPassword(failing, "a@b.co", "nope"), (err: unknown) => {
      assert.ok(err instanceof ApiRequestError);
      assert.equal(err.status, 401);
      assert.equal(err.message, "Incorrect email or password.");
      return true;
    });
  });

  it("rejects a wrong code and an expired code without opening a session", async () => {
    const wrong: ApiClient = {
      async request() {
        throw new ApiRequestError("That code is incorrect.", 400);
      },
    };
    await assert.rejects(() => verifyEmailCode(wrong, challenge.pendingToken, "000000"), /incorrect/);

    const expired: ApiClient = {
      async request() {
        throw new ApiRequestError("That code has expired.", 400);
      },
    };
    await assert.rejects(() => verifyEmailCode(expired, challenge.pendingToken, "123456"), /expired/);
  });

  it("signs up through the email challenge and does not treat a token field as a session", async () => {
    const api = client((path, body) => {
      assert.equal(path, "/auth/signup");
      assert.equal((body as { phone: string }).phone, "+919876543210");
      return {
        kind: "email",
        pendingToken: challenge.pendingToken,
        maskedEmail: challenge.maskedEmail,
        expiresAt: challenge.expiresAt,
        resendAvailableAt: challenge.resendAvailableAt,
        token: "not-a-session",
      };
    });
    const pending = await signupAccount(api, {
      name: "Asha",
      email: "asha@place2park.test",
      password: "Secret123!",
      phone: "+919876543210",
      role: "DRIVER",
    });
    assert.equal(pending.purpose, "signup");
    assert.equal(pending.pendingToken, challenge.pendingToken);
    assert.equal("token" in pending, false);
    assert.throws(() => parseSignupChallenge({ token: "only-a-token" }));
  });

  it("keeps an existing Google account on the email code and a new one on the role step", async () => {
    const existing = parseGoogleStart({ ...challenge });
    assert.equal(existing.kind, "email");
    assert.equal("token" in existing, false);

    const created = parseGoogleStart({
      registrationRequired: true,
      registrationToken: "registration-token-123456",
      maskedEmail: "a***@place2park.test",
      expiresAt: challenge.expiresAt,
      token: "not-a-session",
    });
    assert.equal(created.kind, "registration");

    const paths: string[] = [];
    const api = client((path) => {
      paths.push(path);
      return {
        registrationRequired: true,
        registrationToken: "registration-token-123456",
        maskedEmail: "a***@place2park.test",
        expiresAt: challenge.expiresAt,
      };
    });
    const started = await startGoogleSignIn(api, "google-id-token");
    assert.equal(started.kind, "registration");
    assert.deepEqual(paths, ["/auth/google"]);
  });

  it("sends forgot-password and reset-password without saying whether the email exists", async () => {
    const paths: string[] = [];
    const api = client((path, body) => {
      paths.push(path);
      assert.equal(JSON.stringify(body).includes("sessions/revoke"), false);
      return {};
    });
    await requestPasswordReset(api, "asha@place2park.test");
    await submitPasswordReset(api, "reset-token-value-1234567890", "Secret123!");
    assert.deepEqual(paths, ["/auth/forgot-password", "/auth/reset-password"]);
  });

  it("surfaces a network failure from login", async () => {
    const offline: ApiClient = {
      async request() {
        throw new ApiRequestError("Can't reach the server. Check your connection.", null);
      },
    };
    await assert.rejects(() => loginWithPassword(offline, "asha@place2park.test", "Secret123!"), /connection/);
  });
});
