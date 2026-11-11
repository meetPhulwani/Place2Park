import { OAuth2Client } from "google-auth-library";
import { timeouts } from "../config/timeouts.js";
import { retryIdempotent, withTimeout } from "../utils/async.js";

/** Checks a Google ID token. A timeout can be retried; the check does not create a charge. */
export async function verifyGoogleIdToken(credential: string, audience: string) {
  const client = new OAuth2Client(audience);
  return retryIdempotent(
    () =>
      withTimeout(
        client.verifyIdToken({ idToken: credential, audience }),
        timeouts.googleMs,
        "timeout contacting Google"
      ),
    { attempts: timeouts.readAttempts, baseDelayMs: 40 }
  );
}
