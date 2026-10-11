import crypto from "node:crypto";
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";
import { Booking, Payment } from "../models/index.js";
import { expireStalePendingBookings } from "./availability.js";

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
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  return safeEqualHex(webhookSignature(rawBody, env.RAZORPAY_WEBHOOK_SECRET), signature);
}
