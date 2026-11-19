import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../api/client";
import type { AuthUser } from "../types/auth";
import { invalidateStartup, logoutLocal, restoreSession, startupRestore, withChallenge } from "./session";

const user: AuthUser = { id: "abc", name: "Asha", email: "asha@place2park.test", role: "DRIVER", status: "ACTIVE" };

describe("session", () => {
  it("restores a valid token and clears an expired one", async () => {
    let stored: string | null = "access-jwt";
    const restored = await restoreSession({
      readToken: async () => stored,
      clearToken: async () => {
        stored = null;
      },
      loadUser: async () => user,
    });
    assert.equal(restored.status, "signed-in");
    assert.equal(stored, "access-jwt");

    stored = "expired";
    const expired = await restoreSession({
      readToken: async () => stored,
      clearToken: async () => {
        stored = null;
      },
      loadUser: async () => {
        throw new ApiRequestError("Your session has expired. Please log in again.", 401);
      },
    });
    assert.equal(expired.status, "signed-out");
    assert.equal(stored, null);
  });

  it("moves from a challenge to signed out without a server revoke", async () => {
    const challenge = withChallenge({
      pendingToken: "pending-token-value-123456",
      maskedEmail: "a***@place2park.test",
      expiresAt: "2026-11-19T18:00:00.000Z",
      resendAvailableAt: "2026-11-19T17:46:00.000Z",
      purpose: "login",
    });
    assert.equal(challenge.status, "verify-email");
    let stored: string | null = "access-jwt";
    let networkCalls = 0;
    const next = await logoutLocal(async () => {
      stored = null;
      networkCalls += 0;
    });
    assert.equal(next.status, "signed-out");
    assert.equal(stored, null);
    assert.equal(networkCalls, 0);
    const calls: string[] = [];
    await logoutLocal(async () => {
      calls.push("clear-token");
    });
    assert.deepEqual(calls, ["clear-token"]);
    assert.equal(calls.some((call) => call.includes("/api/account/sessions/revoke")), false);
  });

  it("shares one startup restore until logout invalidates it", async () => {
    invalidateStartup();
    let reads = 0;
    const deps = {
      readToken: async () => "access-jwt",
      clearToken: async () => undefined,
      loadUser: async () => {
        reads += 1;
        return user;
      },
    };
    const [first, second] = await Promise.all([startupRestore(deps), startupRestore(deps)]);
    assert.equal(first.status, "signed-in");
    assert.equal(second.status, "signed-in");
    assert.equal(reads, 1);
    invalidateStartup();
    await startupRestore(deps);
    assert.equal(reads, 2);
  });
});
