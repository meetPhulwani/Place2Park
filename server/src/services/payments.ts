import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { Booking, Payment } from "../models/index.js";
import { expireStalePendingBookings } from "./availability.js";
import { applyRouteTransferEvent, markBookingRefunded } from "./payouts.js";

/**
 * Payment provider boundary. Razorpay is used when credentials exist.
 */
export function razorpayConfigured() {
  return !!(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

export interface PaymentOrder {
  provider: "RAZORPAY" | "MOCK";
  orderId: string;
  amount: number; // paise
  currency: string;
  keyId?: string; // public key for Razorpay checkout — never the secret
  bookingId?: string;
  bookingCode?: string;
}

export function razorpayOrderCreatePayload(bookingId: string, amountPaise: number) {
  return {
    amount: amountPaise,
    currency: "INR",
    payment_capture: true,
    receipt: bookingId.slice(-20),
    notes: { bookingId },
  };
}

export function razorpayRefundParams(amountPaise: number) {
  return { amount: amountPaise, speed: "normal" as const };
}

export async function createPaymentOrder(bookingId: string, amountPaise: number): Promise<PaymentOrder> {
  if (!razorpayConfigured()) {
    throw new ApiError(503, "Razorpay isn't configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const order = await rzp.orders.create(razorpayOrderCreatePayload(bookingId, amountPaise));
  return {
    provider: "RAZORPAY",
    orderId: order.id,
    amount: amountPaise,
    currency: "INR",
    keyId: env.RAZORPAY_KEY_ID,
  };
}

/** Create or reuse a Razorpay order for a PENDING booking. Amount always comes from MongoDB. */
export async function createOrReusePaymentOrder(userId: string, bookingId: string): Promise<PaymentOrder> {
  if (!razorpayConfigured()) {
    throw new ApiError(503, "Razorpay isn't configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  if (!mongoose.isValidObjectId(bookingId)) throw new ApiError(404, "Booking not found.");

  const expiredIds = await expireStalePendingBookings();
  await reconcileExpiredPaymentHolds({}, expiredIds);
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.userId) !== userId) throw new ApiError(404, "Booking not found.");
  if (booking.status !== "PENDING") throw new ApiError(409, "This booking isn't awaiting payment.");
  let payment = await Payment.findOne({ bookingId: booking._id });
  if (booking.expiresAt && booking.expiresAt.getTime() <= Date.now()) {
    booking.status = "EXPIRED";
    await booking.save();
    if (payment?.orderId && payment.status === "CREATED") {
      await cancelUnpaidRazorpayOrder(payment.orderId);
    }
    throw new ApiError(409, "This reservation has expired.");
  }

  if (payment?.status === "PAID") throw new ApiError(409, "This booking is already paid.");

  const amount = booking.totalAmount;
  if (payment?.provider === "RAZORPAY" && payment.orderId && payment.status === "CREATED") {
    return {
      provider: "RAZORPAY",
      orderId: payment.orderId,
      amount: payment.amount || amount,
      currency: payment.currency || "INR",
      keyId: env.RAZORPAY_KEY_ID,
      bookingId: String(booking._id),
      bookingCode: booking.code,
    };
  }

  const order = await createPaymentOrder(String(booking._id), amount);
  if (payment) {
    payment.provider = "RAZORPAY";
    payment.orderId = order.orderId;
    payment.amount = amount;
    payment.currency = "INR";
    payment.status = "CREATED";
    await payment.save();
  } else {
    await Payment.create({
      bookingId: booking._id,
      provider: "RAZORPAY",
      orderId: order.orderId,
      amount,
      currency: "INR",
      status: "CREATED",
    });
  }
  return {
    ...order,
    bookingId: String(booking._id),
    bookingCode: booking.code,
  };
}

export function checkoutSignature(orderId: string, paymentId: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
}

export function webhookSignature(rawBody: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
}

function safeEqualHex(expected: string, received: string) {
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Verify a Razorpay checkout signature server-side. */
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string) {
  if (!env.RAZORPAY_KEY_SECRET) return false;
  return safeEqualHex(checkoutSignature(orderId, paymentId, env.RAZORPAY_KEY_SECRET), signature);
}

/** Verify a Razorpay webhook signature against the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = String(env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
  if (!secret) return false;
  return safeEqualHex(webhookSignature(rawBody, secret), signature);
}

export interface RazorpayRefundResult {
  refundId: string;
  processed: boolean;
  paymentId?: string;
}

export type RefundPaymentFn = (paymentId: string, amountPaise: number) => Promise<RazorpayRefundResult>;
export type ListRefundsFn = (paymentId: string) => Promise<RazorpayRefundResult[]>;
export type CancelOrderResult = "cancelled" | "unsupported" | "skipped";
export type CancelOrderFn = (orderId: string) => Promise<CancelOrderResult>;

/** Events the production Razorpay webhook must send. Transfer events are optional. */
export const EXPECTED_RAZORPAY_WEBHOOK_EVENTS = [
  "payment.captured",
  "order.paid",
  "payment.failed",
  "refund.processed",
  "refund.failed",
] as const;

export const OPTIONAL_RAZORPAY_WEBHOOK_EVENTS = ["transfer.processed", "transfer.failed"] as const;

function asRefundResult(row: { id?: string; refundId?: string; status?: string }): RazorpayRefundResult {
  const refundId = String(row.refundId ?? row.id ?? "");
  const status = String(row.status ?? "").toLowerCase();
  return { refundId, processed: status === "processed" };
}

export async function listRazorpayRefunds(paymentId: string, listFn?: ListRefundsFn): Promise<RazorpayRefundResult[]> {
  if (listFn) return listFn(paymentId);
  if (!razorpayConfigured() || !paymentId) return [];
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const payload = (await rzp.payments.fetchMultipleRefund(paymentId)) as {
    items?: { id?: string; status?: string }[];
  };
  return (payload.items ?? []).map((item) => asRefundResult(item)).filter((row) => row.refundId);
}

export type RazorpayRefundPaymentsClient = {
  fetch: (paymentId: string) => Promise<{ id?: string; status?: string }>;
  capture: (paymentId: string, amount: number, currency: string) => Promise<unknown>;
  refund: (paymentId: string, params: { amount: number; speed?: string }) => Promise<{ id?: string; status?: string }>;
};

export type RazorpayRefundOrdersClient = {
  fetchPayments: (orderId: string) => Promise<{ items?: { id?: string; status?: string }[] }>;
};

function refundFailure(): never {
  throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
}

function razorpayErrorText(err: unknown) {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const nested = (err as { error?: { description?: string; reason?: string } }).error;
    return String(nested?.description || nested?.reason || (err as { message?: string }).message || "");
  }
  return String(err);
}

async function resolveRefundPaymentId(
  paymentId: string,
  orderId: string | undefined,
  orders?: RazorpayRefundOrdersClient
) {
  if (paymentId) return paymentId;
  if (!orderId || !orders) return "";
  const listed = await orders.fetchPayments(orderId);
  const match = (listed.items ?? []).find((item) => {
    const status = String(item.status ?? "").toLowerCase();
    return item.id && (status === "authorized" || status === "captured");
  });
  return String(match?.id ?? "");
}

/**
 * Refund a Razorpay payment. Authorized (uncaptured) Test Mode payments are captured first.
 * Always request normal speed so dashboard Instant Refund defaults cannot fail the call.
 */
export async function settleRazorpayRefund(input: {
  paymentId: string;
  amountPaise: number;
  orderId?: string;
  payments: RazorpayRefundPaymentsClient;
  orders?: RazorpayRefundOrdersClient;
}): Promise<RazorpayRefundResult> {
  if (!Number.isFinite(input.amountPaise) || input.amountPaise <= 0) refundFailure();
  const paymentId = await resolveRefundPaymentId(input.paymentId, input.orderId, input.orders);
  if (!paymentId) refundFailure();

  let status = "";
  try {
    const fetched = await input.payments.fetch(paymentId);
    status = String(fetched?.status ?? "").toLowerCase();
  } catch (err) {
    console.error("[refund] razorpay fetch failed", razorpayErrorText(err));
  }

  if (status === "authorized") {
    try {
      await input.payments.capture(paymentId, input.amountPaise, "INR");
    } catch (err) {
      console.error("[refund] razorpay capture failed", razorpayErrorText(err));
      refundFailure();
    }
  }

  try {
    const refund = await input.payments.refund(paymentId, razorpayRefundParams(input.amountPaise));
    const refundId = String((refund as { id?: string }).id ?? "");
    if (!refundId) refundFailure();
    return {
      refundId,
      processed: String((refund as { status?: string }).status ?? "").toLowerCase() === "processed",
      paymentId,
    };
  } catch (err) {
    console.error("[refund] razorpay refund failed", razorpayErrorText(err));
    refundFailure();
  }
}

/** Refund a captured payment. Amount always comes from the caller (Mongo), never the client. */
export async function refundRazorpayPayment(
  paymentId: string,
  amountPaise: number,
  refundFn?: RefundPaymentFn,
  extras?: { orderId?: string }
): Promise<RazorpayRefundResult> {
  if (refundFn) return refundFn(paymentId, amountPaise);
  if (!razorpayConfigured()) {
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
  if ((!paymentId && !extras?.orderId) || !Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return settleRazorpayRefund({
    paymentId,
    amountPaise,
    orderId: extras?.orderId,
    payments: rzp.payments,
    orders: rzp.orders,
  });
}

/**
 * Cancel an unpaid Razorpay order when the official API supports it.
 * Never throws — booking cancel/expiry must succeed even if order cancel is unsupported.
 */
export async function cancelUnpaidRazorpayOrder(
  orderId: string,
  cancelFn?: CancelOrderFn
): Promise<CancelOrderResult> {
  if (!orderId) return "skipped";
  if (cancelFn) return cancelFn(orderId);
  if (!razorpayConfigured()) return "skipped";
  try {
    const Razorpay = (await import("razorpay")).default;
    const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
    const orders = rzp.orders as { cancel?: (id: string) => Promise<unknown> };
    if (typeof orders.cancel === "function") {
      await orders.cancel(orderId);
      return "cancelled";
    }
    const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
    const res = await fetch(`https://api.razorpay.com/v1/orders/${encodeURIComponent(orderId)}/cancel`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    });
    if (res.ok) return "cancelled";
    if (res.status === 400 || res.status === 404) return "unsupported";
    return "skipped";
  } catch {
    return "skipped";
  }
}

/**
 * Best-effort unpaid-order cleanup after local expiry/cancel.
 * Occupancy is already released; cancel is retried while the provider result is `skipped`.
 */
export async function reconcileExpiredPaymentHolds(
  deps: { cancelOrder?: CancelOrderFn } = {},
  bookingIds?: string[]
) {
  const payments = await Payment.find({
    status: "CREATED",
    orderId: { $nin: [null, ""] },
    orderCancelStatus: { $nin: ["cancelled", "unsupported"] },
    ...(bookingIds?.length ? { bookingId: { $in: bookingIds } } : {}),
  }).limit(50);
  for (const payment of payments) {
    const booking = await Booking.findById(payment.bookingId);
    if (!booking) continue;
    const expiredHold =
      booking.status === "EXPIRED" ||
      booking.status === "CANCELLED" ||
      (booking.status === "PENDING" && !!booking.expiresAt && booking.expiresAt.getTime() <= Date.now());
    if (!expiredHold) continue;
    if (booking.status === "PENDING") {
      await Booking.updateOne({ _id: booking._id, status: "PENDING" }, { $set: { status: "EXPIRED" } });
    }
    const result = await cancelUnpaidRazorpayOrder(payment.orderId ?? "", deps.cancelOrder);
    await Payment.updateOne(
      { _id: payment._id, status: "CREATED" },
      { $set: { orderCancelStatus: result, orderCancelAttemptedAt: new Date() } }
    );
  }
}

export async function applyRefundEvent(input: { event?: string; refundId?: string; paymentId?: string }) {
  const event = input.event ?? "";
  if (!input.refundId && !input.paymentId) return;
  if (event === "refund.processed") {
    const payment = await Payment.findOne({
      $or: [
        ...(input.refundId ? [{ refundId: input.refundId }] : []),
        ...(input.paymentId ? [{ paymentId: input.paymentId }] : []),
      ],
    });
    if (!payment) return;
    if (payment.status !== "REFUNDED") {
      payment.status = "REFUNDED";
      payment.refundStatus = "PROCESSED";
      payment.refundProcessedAt = new Date();
      if (!payment.refundAmount) payment.refundAmount = payment.amount;
      if (input.refundId) payment.refundId = input.refundId;
      await payment.save();
    }
    await markBookingRefunded(payment.bookingId);
    return;
  }
  if (event === "refund.failed" && (input.refundId || input.paymentId)) {
    await Payment.updateOne(
      {
        status: { $ne: "REFUNDED" },
        $or: [
          ...(input.refundId ? [{ refundId: input.refundId }] : []),
          ...(input.paymentId ? [{ paymentId: input.paymentId }] : []),
        ],
      },
      { $set: { refundStatus: "FAILED", refundFailedAt: new Date() } }
    );
  }
}
