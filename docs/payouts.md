# Host payouts — Place2Park

Place2Park does **not** auto-transfer host earnings. A completed booking is calculated revenue only. Money moves to a host only after an admin-approved **manual** payout with an auditable bank/UPI reference.

## Why this is manual

Official [Razorpay Route](https://razorpay.com/docs/payments/route/) is a separate product. Current Razorpay docs require:

1. Route enabled on the **primary merchant** (Dashboard → Payment Products → Route).
2. **Linked Accounts** created (Dashboard or `POST /v2/accounts`) before any transfer.
3. RBI Payment Aggregator eligibility (docs updated for FY25/FY26): domestic taxable turnover **> ₹40 lakh** (GST-3B) **or** export inward remittances **> ₹5 lakh** (FIRC), plus a payer–payee transparency declaration.
4. Transfers only after a payment is **captured**, and the transfer amount must not exceed the captured amount after fees/tax. Webhooks include `transfer.processed`.
5. Refunds of split payments need transfer **reversals** (`POST /v1/transfers/:id/reversals`).

This repository does **not** assume Route is enabled for the Place2Park merchant. It does **not** call Linked Account or transfer APIs, and it does **not** create marketplace `transfers` on orders. Checkout remains a normal `orders.create` into the platform merchant account.

Do not set any “enable Route” switch to start live transfers. Auto-transfer is intentionally unimplemented until Route enablement, Linked Account KYC, refund/reversal behavior, and a dedicated test plan are verified.

## Host flow

1. Host submits bank details at **Host → Settings** (`PUT /api/host/payout-profile`).
2. The API stores holder name, IFSC, last 4 digits, and an encrypted account number. The full number is never logged or returned to the host.
3. An admin verifies the profile (`POST /api/admin/users/:id/verify-payout`).
4. After bookings are `COMPLETED`, paid, not refunded, and not already in a payout, the host can **Request payout** (`POST /api/host/payouts/request`).
5. Amount is the stored `Booking.hostEarning` (90% of the parking fee on new bookings). The driver 5% platform fee stays with the platform. Existing bookings keep the amounts saved at checkout.

## Admin flow

**Admin → Payouts**

1. Approve or reject a `REQUESTED` payout.
2. After you send money outside Razorpay (NEFT/IMPS/UPI), **Mark paid** with the bank/UPI reference.
3. Mark failed to release the bookings back to eligible balance.
4. Record a reversal if a paid payout is clawed back. Reversed bookings stay attached so they are not paid twice.

## Eligibility (implemented)

A booking is eligible only when all of these are true:

- `status === COMPLETED`
- `refunded !== true`
- no `payoutId`
- matching `Payment.status === PAID`
- `Payment.refundStatus` is not `PENDING` or `PROCESSED`

Confirmed/active bookings appear as **upcoming**, not eligible.

## Webhooks

`POST /api/payments/webhook` still verifies `x-razorpay-signature` against the raw body. `refund.processed` / `refund.failed` reconcile open payouts. `transfer.processed` / `transfer.failed` are accepted only if a payout already stored that `transferId`. Manual payouts never set `transferId`, so those events do not mark hosts paid.

## Configuration

No extra production env var is required for manual payouts. Existing `JWT_SECRET` derives the account-number encryption key. Never put bank account numbers in `.env`, client env, or logs.

## Tests

```bash
cd server
npx tsx --test src/services/payouts.test.ts
```
