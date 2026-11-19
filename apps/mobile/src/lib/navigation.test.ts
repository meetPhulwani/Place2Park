import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canOpenProtectedApp, destinationFor } from "./navigation";
import { signedIn, signedOut, withChallenge, withGoogleRegistration } from "../services/session";
import type { AuthUser } from "../types/auth";

const user: AuthUser = { id: "abc", name: "Asha", email: "asha@place2park.test", role: "DRIVER", status: "ACTIVE" };

describe("auth navigation", () => {
  it("keeps signed-out people on login and signed-in people in the app", () => {
    assert.equal(destinationFor({ status: "loading" }), null);
    assert.equal(destinationFor(signedOut()), "/(auth)/login");
    assert.equal(canOpenProtectedApp(signedOut()), false);
    assert.equal(destinationFor(signedIn(user)), "/(app)");
    assert.equal(canOpenProtectedApp(signedIn(user)), true);
    assert.equal(
      destinationFor(
        withChallenge({
          purpose: "login",
          pendingToken: "pending-token-value-123456",
          maskedEmail: "a***@place2park.test",
          expiresAt: "2026-11-19T18:00:00.000Z",
          resendAvailableAt: "2026-11-19T17:46:00.000Z",
        })
      ),
      "/(auth)/verify-email"
    );
    assert.equal(
      destinationFor(
        withGoogleRegistration({
          registrationToken: "registration-token-123456",
          maskedEmail: "a***@place2park.test",
          expiresAt: "2026-11-19T18:00:00.000Z",
        })
      ),
      "/(auth)/google-role"
    );
  });
});
