# Place2Park deployment checklist

Automated tests do **not** prove real-money production is safe. Use this list after a deploy, not instead of operator checks.

Do not run `npx tsx src/scripts/ensure-indexes.ts --apply` as part of this deploy. Do not create live Razorpay charges, refunds, or payouts from CI or from this repository’s agent session.

## 1. Environment variables

### Render API (`server/`)

| Variable | Required in production | Notes |
|---|---|---|
| `NODE_ENV` | Yes | Must be `production` |
| `PORT` | Platform | Render sets this |
| `MONGODB_URI` | Yes | Atlas URI. Boot fails if missing |
| `MONGODB_DB` | Yes | `parkly` (or the dedicated app DB). Do not use `test` |
| `JWT_SECRET` | Yes | Unique, ≥ 32 characters. Rotating it signs out every user |
| `CLIENT_URL` | Yes | Exact Vercel origin. Must not be localhost |
| `RAZORPAY_KEY_ID` | Yes for checkout | Same mode as the dashboard (live vs test) |
| `RAZORPAY_KEY_SECRET` | Yes for checkout | Server only. Never log |
| `RAZORPAY_WEBHOOK_SECRET` | Yes | Boot fails in production if empty. Must match Razorpay dashboard |
| `CLOUDINARY_CLOUD_NAME` | Yes | Boot fails if any Cloudinary value is missing |
| `CLOUDINARY_API_KEY` | Yes | |
| `CLOUDINARY_API_SECRET` | Yes | |
| `GOOGLE_CLIENT_ID` | If Google login is offered | Must match the client GIS client id |
| `GOOGLE_CLIENT_SECRET` | No for GIS ID-token login | Unused by `POST /api/auth/google` |
| `EMAIL_FROM` | Yes if SMTP is used | Real mailbox or `Name <addr@your-domain>`. `.test` / `.example` / `parkly.dev` disable sending |
| `ADMIN_NOTIFICATION_EMAIL` | Yes for payout-request alerts | Real ops inbox. Never `parkly.test` or other placeholders |
| `SMTP_HOST` | Yes if sending mail | Production forgot-password returns 503 if SMTP is unset |
| `SMTP_PORT` | Yes if sending mail | `587` STARTTLS or `465` implicit TLS |
| `SMTP_USER` | Yes if sending mail | |
| `SMTP_PASS` | Yes if sending mail | Never log |

Never put Razorpay or Cloudinary secrets in the Vercel client env.

### Vercel SPA (`client/` build-time)

| Variable | Required | Notes |
|---|---|---|
| `VITE_API_URL` | Yes | `https://<render-api-host>/api` |
| `VITE_GOOGLE_MAPS_API_KEY` | Yes for maps/search | Browser key, HTTP-referrer restricted |
| `VITE_GOOGLE_CLIENT_ID` | If Google login is offered | Same GIS client as `GOOGLE_CLIENT_ID` |
| `VITE_RAZORPAY_KEY_ID` | Yes for checkout | Public key id only. Must match server mode |

## 2. Razorpay webhook

URL: `https://<render-api-host>/api/payments/webhook`

Required events (`EXPECTED_RAZORPAY_WEBHOOK_EVENTS`):

- `payment.captured`
- `order.paid`
- `payment.failed`
- `refund.processed`
- `refund.failed`

Optional (ignored unless a payout already stored that `transferId`):

- `transfer.processed`
- `transfer.failed`

Confirm the webhook is active, the secret matches Render, and recent deliveries are 2xx after deploy. Enable dashboard alerts for failed deliveries. Razorpay Route / linked accounts stay **off**.

## 3. Atlas indexes

Production disables Mongoose `autoIndex`. Boot only calls `ParkingSpace.syncIndexes()`.

Required unique indexes (dry-run only this cycle):

| Collection | Fields |
|---|---|
| `users` | `email` |
| `bookings` | `code` |
| `payments` | `bookingId` |
| `hostpayouts` | `idempotencyKey` |
| `favorites` | `userId` + `spaceId` |

Check: from `server/`, `npx tsx src/scripts/ensure-indexes.ts` (no `--apply`).

If `duplicateCount > 0`, stop and reconcile manually. Do not delete paid bookings, payments, or payouts without an operator review. See `docs/indexes.md`.

`adminaudits` is a new append-only collection. It has no unique-index requirement and is not part of `ensure-indexes.ts`.

## 4. Deploy order

1. Deploy the **API** first (reveal route, session `ver`, refund occupancy, audit collection).
2. Deploy the **SPA** (last4-only list, reveal/hide, no full account in list state).
3. Confirm Render boot logs: Mongo connected, no webhook-secret / Cloudinary / JWT boot error. Do not paste secrets from logs.

## 5. Post-deployment checks (manual)

Use test mode or a single controlled live booking — not a script that creates charges.

1. Password reset: old JWT returns 401; new login works.
2. Google sign-in on an existing password email returns 409 and does not set `googleId`.
3. Reserve → Pay now → webhook or verify confirms the booking once.
4. Dashboard `refund.processed` on a **future CONFIRMED** booking: status `CANCELLED`, slot free, not payout-eligible.
5. Refund on an **ACTIVE** stay: remains `ACTIVE` and occupying; still not payout-eligible.
6. Refunded **CONFIRMED** whose window already ended: slot is free; status is not `ACTIVE`.
7. Let a `PENDING` hold expire: booking `EXPIRED`, occupancy free. Order cancel may be `cancelled`, `unsupported`, or `skipped`; a later `payment.captured` must refund, not confirm over a taken slot.
8. Admin payouts: list shows `****last4` only. Reveal is admin-only, writes an `AdminAudit` row with last4 only (`GET /api/admin/payouts/:id/destination-audits`). Hide / refresh / leave the tab clears the on-screen number.
9. Host listing photo upload lands under `place2park/listings/{userId}/`. Saving another host’s publicId does not delete their Cloudinary asset.

## 6. Rollback

- Revert the API and SPA to the previous pair. Do not roll back only the client (reveal UI would call a missing route) or only the API (client would hide numbers the API still returns).
- `tokenVersion` / JWT `ver`: old builds still accept `ver: 0`. After this deploy, a password reset increments `ver` and old tokens stay invalid even if you roll back the API, unless you also restore `tokenVersion` (do not do that in bulk).
- `AdminAudit` rows and `Payment.orderCancelStatus` are additive. Leaving them in Mongo after rollback is safe.
- Do not drop unique indexes. Do not rewrite historical `baseAmount` / `hostEarning` / `totalAmount`.

## 7. Remaining risks

- Razorpay order-cancel is best-effort. `unsupported` or `skipped` leaves an unpaid order at the provider; local occupancy is already released. Capture-after-expiry relies on `settleCapturedPayment`.
- Reconcile processes at most 50 unpaid expired holds per request. A large backlog needs traffic or a later operator pass.
- Search still expires pending holds on read. A quiet site can delay both expiry visibility and order-cancel retries.
- A refunded **ACTIVE** stay occupies until `end`. That is intentional.
- Stolen Cloudinary **URLs** can still be displayed if pasted without a publicId.
- There is no self-serve “link Google after password login” flow.
- Reveal audit is Mongo-backed but there is no admin UI for the audit list yet (`GET /api/admin/payouts/:id/destination-audits` only).
- Unique indexes may still be missing on Atlas until a reviewed `--apply`.
- SMTP, Maps quotas, Cloudinary folder ACLs, and live Razorpay webhook delivery are unverified by unit tests.
