import { OAuth2Client } from "google-auth-library";
import { timeouts } from "../config/timeouts.js";
import { withTimeout } from "../utils/async.js";
import { retryOperation } from "../utils/retry.js";

/** Checks a Google ID token. A timeout can be retried; the check does not create a charge. */
export async function verifyGoogleIdToken(credential: string, audience: string) {
  const client = new OAuth2Client(audience);
  return retryOperation(
    () =>
      withTimeout(
        client.verifyIdToken({ idToken: credential, audience }),
        timeouts.googleMs,
        "timeout contacting Google"
      ),
    {
      service: "google",
      operation: "verifyIdToken",
      maxAttempts: timeouts.readAttempts,
      deadlineMs: timeouts.googleMs * timeouts.readAttempts + timeouts.retryMaxDelayMs,
      retryCategories: ["timeout", "transient_network", "server", "rate_limited"],
    }
  );
}
