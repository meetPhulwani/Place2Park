# Razorpay Test Mode — Place2Park

Payments confirm a booking only after the **server** verifies Razorpay’s signature. The browser success callback is not enough.

## 1. Keys

1. Open [Razorpay Dashboard](https://dashboard.razorpay.com/) and switch to **Test Mode**.
2. Copy **Key ID** (`rzp_test_…`) and **Key Secret**.
3. Put them only in `server/.env`:

```
RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
RAZORPAY_KEY_SECRET=your_razorpay_key_secret
RAZORPAY_WEBHOOK_SECRET=your_razorpay_webhook_secret
```

Never put `RAZORPAY_KEY_SECRET` or `RAZORPAY_WEBHOOK_SECRET` in `client/.env` or commit them.

`server/.env.example` and the repo `.env.example` contain placeholders only.

## 2. Run the apps

```bash
cd server && npm run dev
cd client && npm run dev
```

Restart the API after changing `.env`.

## 3. Checkout (manual)

1. Log in as `driver@parkly.dev` / `password123`.
2. Reserve a listing (date, start time, duration) and open the booking details page.
3. Click **Pay now**. Razorpay Checkout should open with the server-created order (INR, amount in paise).
4. Use Razorpay **test** methods only, for example:
   - Card: `4111 1111 1111 1111`, any future expiry, any CVV, any 3DS success
   - UPI: test VPA from the Razorpay test-mode docs
5. After Checkout, the client posts to `/api/payments/verify`. The booking becomes `CONFIRMED` and payment `PAID` only if the signature matches.
6. Closing Checkout leaves the booking `PENDING` / payment pending. You can click **Pay now** again; the same Razorpay order is reused while it is still `CREATED`.

## 4. Webhook (optional locally, required in production)

1. In the dashboard, add webhook URL `https://<your-tunnel>/api/payments/webhook`.
2. Enable `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, and `refund.failed`. Optional: `transfer.processed` / `transfer.failed` (ignored unless a payout already stored that transfer id). Host payouts are manual — see [payouts.md](payouts.md). Razorpay Route is **not** implemented.
3. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`. Production (`NODE_ENV=production`) will not start without it. Local development can omit it; webhook verification then fails closed.
4. The handler verifies `x-razorpay-signature` against the **raw** JSON body. Duplicate `payment.captured` events confirm or refund once. A captured payment that cannot be confirmed is refunded using the stored Mongo amount; the webhook returns HTTP 200 only after that state is recorded.

## 4b. Production dashboard checklist (manual)

Do not paste secrets into tickets or logs. Confirm in Razorpay + Render + Atlas:

| Check | Expected |
|---|---|
| Render `NODE_ENV` | `production` |
| Render `CLIENT_URL` | Exact Vercel origin, not localhost |
| Render `JWT_SECRET` | Unique, ≥ 32 characters |
| Render `MONGODB_URI` / `MONGODB_DB` | Atlas URI + `parkly` (or the dedicated app DB) |
| Render Cloudinary trio | Set (boot fails without them) |
| Render `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Live or test keys that match the dashboard mode |
| Render `RAZORPAY_WEBHOOK_SECRET` | **Same value** as the Razorpay webhook secret (required to boot) |
| Razorpay webhook URL | `https://<render-api-host>/api/payments/webhook` |
| Razorpay webhook events | `payment.captured`, `order.paid`, `payment.failed`, `refund.processed`, `refund.failed` |
| Razorpay webhook active | Yes; recent deliveries 2xx after deploy |
| Alert emails | Enabled for failed webhook deliveries |
| Route / linked accounts | Off — payouts are manual |

Active events are listed in code as `EXPECTED_RAZORPAY_WEBHOOK_EVENTS` in `server/src/services/payments.ts`.

## 5. Automated checks

```bash
cd server
npm run typecheck
npx tsx --test src/services/payments.test.ts
npx tsx src/scripts/test-payment-flow.ts
```

The live script creates a real Test Mode order and checks verify/webhook security. Completing Checkout with a test card still has to be done in the browser.
