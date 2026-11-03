import type { NextFunction, Request, Response } from "express";
import { Booking, Payment } from "../models/index.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { failBookingPayment, settleCapturedPayment, type CaptureSettlementDeps } from "../services/bookings.js";
import {
  applyRefundEvent,
  captureMatchesStored,
  createOrReusePaymentOrder,
  fetchRazorpayPayment,
  verifyRazorpaySignature,
  verifyWebhookSignature,
} from "../services/payments.js";
import { applyRouteTransferEvent } from "../services/payouts.js";

type PaymentRequestDeps = CaptureSettlementDeps & {
  fetchPayment?: (paymentId: string) => Promise<{ amount?: unknown; currency?: unknown }>;
};

function settlementDeps(value: PaymentRequestDeps | NextFunction | undefined): PaymentRequestDeps {
  return value && typeof value === "object" ? value : {};
}

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
export async function verify(
  req: AuthedRequest,
  res: Response,
  deps: PaymentRequestDeps | NextFunction = {}
) {
  const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body as Record<string, string>;
  if (!bookingId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature)
    throw new ApiError(400, "Missing payment fields.");

  const booking = await Booking.findById(bookingId);
  if (!booking || String(booking.userId) !== req.userId) throw new ApiError(404, "Booking not found.");

  const payment = await Payment.findOne({ bookingId: booking._id });
  if (!payment || !payment.orderId || payment.orderId !== razorpayOrderId)
    throw new ApiError(400, "Order mismatch.");

  const requestDeps = settlementDeps(deps);
  const alreadySettled = payment.status === "PAID" || payment.status === "REFUNDED";
  if (!alreadySettled) {
    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature))
      throw new ApiError(400, "Payment verification failed.");
    let captured: { amount?: unknown; currency?: unknown };
    try {
      captured = await (requestDeps.fetchPayment ?? fetchRazorpayPayment)(razorpayPaymentId);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(503, "We couldn't verify that payment. Try again shortly.");
    }
    if (!captureMatchesStored(payment, captured)) throw new ApiError(400, "Payment verification failed.");
  }

  const settled = await settleCapturedPayment(
    bookingId,
    payment.paymentId || razorpayPaymentId,
    razorpaySignature,
    requestDeps
  );
  res.json({
    success: true,
    data: {
      bookingId: String(booking._id),
      alreadyPaid: settled.outcome === "already_paid",
      refunded: settled.refunded,
      refundStatus: settled.refundStatus,
    },
  });
}

/** Kept for compatibility. Checkout must go through Razorpay + /payments/verify. */
export async function mockConfirm(_req: AuthedRequest, _res: Response) {
  throw new ApiError(403, "Use Razorpay Checkout. Bookings are confirmed only after server-side verification.");
}

/** Razorpay webhook (payment.captured / payment.failed). Verifies the raw body. */
export async function webhook(req: Request, res: Response, deps: PaymentRequestDeps | NextFunction = {}) {
  const signature = req.headers["x-razorpay-signature"];
  const raw = (req as Request & { rawBody?: string }).rawBody;
  if (typeof signature !== "string" || typeof raw !== "string" || !verifyWebhookSignature(raw, signature)) {
    res.status(400).json({ success: false, message: "Invalid signature." });
    return;
  }

  let event: {
    event?: string;
    payload?: {
      payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string } };
      refund?: { entity?: { id?: string; payment_id?: string; status?: string } };
      transfer?: { entity?: { id?: string; status?: string } };
    };
  };
  try {
    event = JSON.parse(raw) as typeof event;
  } catch {
    res.status(400).json({ success: false, message: "Invalid payload." });
    return;
  }

  const transferEntity = event.payload?.transfer?.entity;
  if (transferEntity?.id && (event.event === "transfer.processed" || event.event === "transfer.failed")) {
    await applyRouteTransferEvent({ event: event.event, transferId: transferEntity.id });
  }

  const refundEntity = event.payload?.refund?.entity;
  if (refundEntity && (event.event === "refund.processed" || event.event === "refund.failed")) {
    await applyRefundEvent({
      event: event.event,
      refundId: refundEntity.id,
      paymentId: refundEntity.payment_id,
    });
  }

  const entity = event.payload?.payment?.entity;
  if (entity?.order_id) {
    const payment = await Payment.findOne({ orderId: entity.order_id });
    if (payment) {
      if ((event.event === "payment.captured" || event.event === "order.paid") && entity.id) {
        if (!captureMatchesStored(payment, entity)) {
          console.warn(JSON.stringify({ event: "payment_amount_mismatch", bookingId: String(payment.bookingId) }));
        } else {
          await settleCapturedPayment(String(payment.bookingId), entity.id, undefined, settlementDeps(deps));
        }
      } else if (event.event === "payment.failed" && payment.status !== "PAID" && payment.status !== "REFUNDED")
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
