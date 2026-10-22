import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { Booking, Payment } from "../models/index.js";
import { expireStalePendingBookings } from "./availability.js";
import { applyRouteTransferEvent, reconcileRefundedBooking } from "./payouts.js";

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

export async function createPaymentOrder(bookingId: string, amountPaise: number): Promise<PaymentOrder> {
  if (!razorpayConfigured()) {
    throw new ApiError(503, "Razorpay isn't configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const order = await rzp.orders.create({
    amount: amountPaise,
    currency: "INR",
    receipt: bookingId.slice(-20),
    notes: { bookingId },
  });
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

  await expireStalePendingBookings();
  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.userId) !== userId) throw new ApiError(404, "Booking not found.");
  if (booking.status !== "PENDING") throw new ApiError(409, "This booking isn't awaiting payment.");
  if (booking.expiresAt && booking.expiresAt.getTime() <= Date.now()) {
    booking.status = "EXPIRED";
    await booking.save();
    throw new ApiError(409, "This reservation has expired.");
  }

  let payment = await Payment.findOne({ bookingId: booking._id });
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
}

export type RefundPaymentFn = (paymentId: string, amountPaise: number) => Promise<RazorpayRefundResult>;

/** Refund a captured payment. Amount always comes from the caller (Mongo), never the client. */
export async function refundRazorpayPayment(
  paymentId: string,
  amountPaise: number,
  refundFn?: RefundPaymentFn
): Promise<RazorpayRefundResult> {
  if (refundFn) return refundFn(paymentId, amountPaise);
  if (!razorpayConfigured()) {
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
  if (!paymentId || !Number.isFinite(amountPaise) || amountPaise <= 0) {
    throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  }
  const Razorpay = (await import("razorpay")).default;
  const rzp = new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  const refund = await rzp.payments.refund(paymentId, { amount: amountPaise });
  const refundId = String((refund as { id?: string }).id ?? "");
  if (!refundId) throw new ApiError(503, "We couldn't process the refund. Try again shortly.");
  const status = String((refund as { status?: string }).status ?? "").toLowerCase();
  return { refundId, processed: status === "processed" };
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
    if (!payment || payment.status === "REFUNDED") return;
    payment.status = "REFUNDED";
    payment.refundStatus = "PROCESSED";
    payment.refundProcessedAt = new Date();
    if (!payment.refundAmount) payment.refundAmount = payment.amount;
    if (input.refundId) payment.refundId = input.refundId;
    await payment.save();
    await Booking.updateOne({ _id: payment.bookingId }, { $set: { refunded: true } });
    await reconcileRefundedBooking(payment.bookingId);
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
