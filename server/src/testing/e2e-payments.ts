import crypto from "node:crypto";
import { env } from "../config/env.js";
import { ApiError } from "../middleware/error.js";

const orders = new Map<string, { amount: number; currency: string }>();
const captures = new Map<string, { amount: number; currency: string }>();

/** Local checkout order. The Razorpay SDK is not constructed. */
export function localPaymentOrder(amountPaise: number) {
  const orderId = `order_e2e_${crypto.randomBytes(8).toString("hex")}`;
  orders.set(orderId, { amount: amountPaise, currency: "INR" });
  return {
    provider: "RAZORPAY" as const,
    orderId,
    amount: amountPaise,
    currency: "INR",
    keyId: env.RAZORPAY_KEY_ID || "rzp_test_e2e_local_only",
  };
}

export function e2eOrderAmount(orderId: string) {
  return orders.get(orderId) ?? null;
}

/** Binds a local payment id to the stored order amount so verification can check it. */
export function bindE2eCapture(orderId: string, paymentId: string) {
  const order = orders.get(orderId);
  if (!order || !paymentId.startsWith("pay_e2e_")) return null;
  captures.set(paymentId, order);
  return order;
}

export function localCapture(paymentId: string) {
  const row = captures.get(paymentId);
  if (!row) throw new ApiError(503, "We couldn't verify that payment. Try again shortly.");
  return { amount: row.amount, currency: row.currency };
}

export function localRefund() {
  return { refundId: `rfnd_e2e_${crypto.randomBytes(4).toString("hex")}`, processed: true };
}
