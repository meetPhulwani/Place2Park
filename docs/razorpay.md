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

## 4. Webhook (optional locally)

1. In the dashboard, add webhook URL `https://<your-tunnel>/api/payments/webhook`.
2. Enable `payment.captured`, `payment.failed`, `refund.processed`, and `refund.failed`.
3. Copy the webhook secret into `RAZORPAY_WEBHOOK_SECRET`.
4. The handler verifies `x-razorpay-signature` against the **raw** JSON body and ignores duplicate `payment.captured` events.

## 5. Automated checks

```bash
cd server
npm run typecheck
npx tsx --test src/services/payments.test.ts
npx tsx src/scripts/test-payment-flow.ts
```

The live script creates a real Test Mode order and checks verify/webhook security. Completing Checkout with a test card still has to be done in the browser.
