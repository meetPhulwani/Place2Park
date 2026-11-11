# Place2Park tests

The API and client already use Node’s built-in test runner (`node:test`) through `tsx`. That suite is unchanged. Vitest and Supertest are not added, because rewriting the working files would duplicate coverage that already talks to an in-memory MongoDB and the Express app.

Browser journeys use Playwright. They boot a separate API on port 5055 with an in-memory database and blank mail, payment, and storage credentials. That process also raises its own request cap so one browser can finish the journeys. The Vite dev server on port 4173 proxies `/api` to that process. Nothing in this path reads the production database.

## Commands

From the repository root:

| Command | What it runs |
| --- | --- |
| `npm test` | Server unit + integration, then client unit tests |
| `npm run test:unit` | Pure server tests and client tests |
| `npm run test:integration` | Server tests that use an in-memory database or HTTP |
| `npm run test:e2e` | Playwright browser journeys |
| `npm run test:coverage` | The same server and client tests with coverage |
| `npm run test:ci` | Tests, typechecks, browser tests, public build, and admin console build |

Server-only and client-only variants live in `server/package.json` and `client/package.json`.

The test runner sets `MONGODB_URI` empty, `REDIS_URL` to a single space, and clears mail and Razorpay variables before the app loads. `dotenv` does not override variables that are already set.

`npm run test:payments` and `npm run test:booking-flow` in `server/` are older manual scripts. They are not part of `npm test` or CI. Do not point them at production.

## Browser tests

`npm run test:e2e` installs nothing by itself. Install the browser once:

```bash
npx playwright install chromium
```

Failed tests keep a screenshot, a video, and a trace. Open the HTML report with:

```bash
npx playwright show-report
```

The report is written to `playwright-report/` and is gitignored.

The browser server turns on `E2E_TEST_HOOKS` after it has blanked the real database, mail, and payment credentials. That flag is ignored when `NODE_ENV` is `production`. Verification codes stay in memory for `@place2park.test` addresses and are never written to the server log. Checkout uses a local order and a stubbed Razorpay script, so the suite does not create a charge or a transfer. The admin console is mounted only on this process at `/e2e-console`, and its two administrators exist only in the in-memory database.

Chromium runs the full browser suite. A Pixel 5 project repeats the journeys that create their own accounts or bookings. The seeded driver reservation and the host editor stay on desktop, because those journeys change one shared listing.

## CI

`.github/workflows/tests.yml` runs on pushes to `main`, `master`, `develop`, `development`, and `dev/**`, and on pull requests. The job installs dependencies, runs the server and client suites with coverage, typechecks both packages, runs Playwright, builds the public site, then builds the admin console with `CONSOLE_BUILD=1`. Coverage is printed as a table. This Node release does not accept a separate lcov reporter, so the table in the job log is the report. On failure, the Playwright HTML report, screenshots, and traces are uploaded. The job does not receive production secrets.

## Coverage already in the server suite

These areas already have node:test files and were not rewritten:

- Price quotes, the 5% driver fee, and the 10% host fee
- Booking overlap, cancellation, and refunds
- Payment signatures and webhook checks
- Payout encryption, masking, and eligibility
- Signup, login, OTP, and session revocation
- Listing moderation
- Admin console authentication, permissions, payout ledger actions, and audit rows
- Account deletion, including the exact `CONFIRM` string, reauthentication, blockers, and a repeated delete
- Account settings and the client confirmation helpers

## Browser journeys added for the remaining gaps

- Signup through an in-memory code: a wrong code, an expired code, resend, and a completed verification
- Settings deletion of a disposable account, including typed `CONFIRM`, blocked paste, password reauthentication, a failed later login, and retained booking, payment, and audit rows
- Admin console email, password, email code, security question, and authenticator login, plus logout, idle expiry, CSRF, a support permission denial, listing approval, payout approval, and the audit log
- Local checkout success, a rejected signature, a closed checkout, a duplicate webhook, an invalid webhook signature, and the disabled mock-confirm route

## Timeouts

Defaults live in `server/src/config/timeouts.ts` and can be overridden with the variables in `server/.env.example`. The client uses `VITE_API_TIMEOUT_MS` (default 25 seconds).

Retries share `server/src/utils/retry.ts`. The wait is full jitter: a random value from 0 through the exponential cap, starting at 500 ms and doubling until 10 seconds. The default budget is 4 attempts, including the first try. The operation deadline still wins, so a retry does not run after that budget is gone. HTTP 400, 401, 403, and 404 are not retried. HTTP 429 uses Retry-After when it fits the deadline and the 10 second cap. Logs record the service, operation, attempt, delay, and error category. They do not record passwords, tokens, OTPs, or payment secrets.

The client retries GET and HEAD for a fast network error, 408, 429, or 500–504, with the same jitter, at most 3 extra tries, and an 8 second overall budget. A request that already used the 25 second client timeout is not sent again. POST, PATCH, and DELETE are not retried. Cancelling a request stops the wait.

A normal API request ends after 30 seconds with HTTP 503 and "The request took too long. Please try again." Payment verification, webhooks, order creation, booking creation, and cancellation keep a 50 second budget. MongoDB selection and connect wait 10 seconds, and a socket waits 45 seconds. The driver retries transient reads and writes; application code does not wrap each query. Redis connect and commands wait 2 seconds, and a command is retried once by the driver. That retry count cannot be raised, and a Redis timeout still closes console, login, signup, and OTP limits. Razorpay payment reads wait 8 seconds and may be tried twice. Creating a charge, capturing, refunding, and cancelling an order are not retried. Resend waits 10 seconds and may be tried twice with the same idempotency key. SMTP is not retried. Google token checks wait 8 seconds and may be tried twice. A listing photo upload waits 25 seconds and is not retried, because a timed-out upload may already be stored. Uploads stay at 5 MB. Booking creation and payout transfers are not retried.

A provider timeout does not mark a payment failed. The booking stays pending until Razorpay's payment record or a webhook shows the result. Admin sessions still idle out after 30 minutes, end after 8 hours, and keep the 5 minute single-use email code. If Redis times out, console, login, signup, and OTP limits stay closed.

These cases use mocked providers and the in-memory database. The suite does not create a Razorpay charge or a bank transfer.

## Not covered by an automated browser session

- Google sign-in and a live mailbox or SMS provider
- A live Razorpay charge, refund, or bank transfer
- Provisioning a production Super Admin, or the 30-minute idle timer without the test hook that ages the session
- The seeded driver reservation and the host listing editor on a phone-sized viewport, because both change one shared listing
