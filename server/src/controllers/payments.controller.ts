import type { Request, Response } from "express";
import { Booking, Payment } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { confirmBookingPaid, failBookingPayment } from "../services/bookings.js";
import {
  createOrReusePaymentOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
} from "../services/payments.js";

function publicOrder(order: {
  provider: string;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  bookingId?: string;
  bookingCode?: string;
}) {
  return {
    provider: order.provider,
    orderId: order.orderId,
    amount: order.amount,
    currency: order.currency,
    keyId: order.keyId,
    bookingId: order.bookingId,
    bookingCode: order.bookingCode,
  };
}

/** Create or reuse a Razorpay order for the caller's PENDING booking. */
export async function createOrder(req: AuthedRequest, res: Response) {
  const bookingId = typeof req.body?.bookingId === "string" ? req.body.bookingId : "";
  const order = await createOrReusePaymentOrder(req.userId, bookingId);
  res.status(201).json({ success: true, data: publicOrder(order) });
}

/** Razorpay checkout callback verification (server-side signature check). */
export async function verify(req: AuthedRequest, res: Response) {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as Record<string, string>;
  if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
    throw new ApiError(400, "Missing payment fields.");

  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.userId) !== req.userId) throw new ApiError(404, "Booking not found.");

  const payment = await Payment.findOne({ bookingId: booking._id });
  if (!payment || !payment.orderId || payment.orderId !== razorpayOrderId)
    throw new ApiError(400, "Order mismatch.");

  if (payment.status === "PAID") {
    res.json({ success: true, data: { bookingId: String(booking._id), alreadyPaid: true } });
    return;
  }

  if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature))
    throw new ApiError(400, "Payment verification failed.");

  await confirmBookingPaid(bookingId, razorpayPaymentId, razorpaySignature);
  res.json({ success: true, data: { bookingId: String(booking._id), alreadyPaid: false } });
}

/** Kept for compatibility. Checkout must go through Razorpay + /payments/verify. */
export async function mockConfirm(_req: AuthedRequest, _res: Response) {
  throw new ApiError(403, "Use Razorpay Checkout. Bookings are confirmed only after server-side verification.");
}

/** Razorpay webhook (payment.captured / payment.failed). Verifies the raw body. */
export async function webhook(req: Request, res: Response) {
  const signature = req.headers["x-razorpay-signature"];
  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (typeof signature !== "string" || typeof raw !== "string" || !verifyWebhookSignature(raw, signature)) {
    res.status(400).json({ success: false, message: "Invalid signature." });
    return;
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    res.status(400).json({ success: false, message: "Invalid payload." });
    return;
  }

  const entity = event.payload?.payment?.entity;
  if (entity?.order_id) {
    const payment = await Payment.findOne({ orderId: entity.order_id });
    if (payment) {
      if ((event.event === "payment.captured" || event.event === "order.paid") && payment.status !== "PAID" && entity.id)
        await confirmBookingPaid(String(payment.bookingId), entity.id);
      else if (event.event === "payment.failed" && payment.status !== "PAID")
        await failBookingPayment(String(payment.bookingId));
    }
  }
  res.json({ success: true });
}

export async function listMine(req: AuthedRequest, res: Response) {
  const bookings = await Booking.find({ userId: req.userId }).select("_id code spaceId").populate("spaceId", "title");
  const payments = await Payment.find({ bookingId: { $in: bookings.map((b) => b._id) } }).sort({ createdAt: -1 });
  const byBooking = new Map(bookings.map((b) => [String(b._id), b]));
  res.json({
    success: true,
    data: {
      payments: payments.map((p) => {
        const b = byBooking.get(String(p.bookingId));
        const s = b?.spaceId as unknown as { title?: string } | null;
        return { ...p.toJSON(), bookingCode: b?.code ?? "", spaceTitle: s?.title ?? "" };
      }),
    },
  });
}
