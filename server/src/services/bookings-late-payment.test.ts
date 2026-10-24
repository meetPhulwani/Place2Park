import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, Notification, Payment, ParkingSpace } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { cancelBooking, settleCapturedPayment } from "./bookings.js";
import { verify, webhook } from "../controllers/payments.controller.js";
import { env } from "../config/env.js";
import { checkoutSignature, reconcileExpiredPaymentHolds, webhookSignature } from "./payments.js";
import { expireStalePendingBookings } from "./availability.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Request, Response } from "express";

const ownerId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();

let memory: MongoMemoryServer;
let spaceId: mongoose.Types.ObjectId;

const CHECKOUT_SECRET = "late_pay_checkout_secret";
const WEBHOOK_SECRET = "late_pay_webhook_secret";

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600000);
}

function jsonRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

async function seedHold(opts?: {
  expired?: boolean;
  cancelled?: boolean;
  orderId?: string;
  amount?: number;
}) {
  const start = hoursFromNow(3);
  const booking = await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: ownerId,
    spaceId,
    hostId,
    start,
    end: new Date(start.getTime() + 2 * 3600000),
    durationMins: 120,
    status: opts?.cancelled ? "CANCELLED" : "PENDING",
    expiresAt: opts?.expired ? new Date(Date.now() - 60_000) : new Date(Date.now() + 12 * 60_000),
    cancelledAt: opts?.cancelled ? new Date() : undefined,
    vehicleType: "CAR",
    accessCode: "654321",
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: opts?.amount ?? 7350,
    platformFee: 1050,
    hostEarning: 5950,
  });
  const orderId = opts?.orderId ?? `order_${booking._id.toString().slice(-10)}`;
  await Payment.create({
    bookingId: booking._id,
    provider: "RAZORPAY",
    orderId,
    amount: opts?.amount ?? 7350,
    currency: "INR",
    status: "CREATED",
  });
  return { booking, orderId };
}

async function occupySlot(start: Date, end: Date) {
  await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: new mongoose.Types.ObjectId(),
    spaceId,
    hostId,
    start,
    end,
    durationMins: 120,
    status: "CONFIRMED",
    vehicleType: "CAR",
    accessCode: "111111",
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: 7350,
    platformFee: 1050,
    hostEarning: 5950,
  });
}

function captureWebhook(orderId: string, paymentId: string) {
  const raw = JSON.stringify({
    event: "payment.captured",
    payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
  });
  return {
    raw,
    req: {
      headers: { "x-razorpay-signature": webhookSignature(raw, WEBHOOK_SECRET) },
      rawBody: raw,
    } as unknown as Request & { rawBody: string },
  };
}

const prevCheckout = env.RAZORPAY_KEY_SECRET;
const prevWebhook = env.RAZORPAY_WEBHOOK_SECRET;

before(async () => {
  env.RAZORPAY_KEY_SECRET = CHECKOUT_SECRET;
  env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-late-pay-test"));
  const space = await ParkingSpace.create({
    hostId,
    title: "Late payment space",
    address: "Hidden until booked",
    area: "BKC",
    city: "Mumbai",
    location: { type: "Point", coordinates: [72.87, 19.06] },
    pricePerHour: 3500,
    status: "VERIFIED",
    bookingsCount: 0,
  });
  spaceId = space._id as mongoose.Types.ObjectId;
});

after(async () => {
  env.RAZORPAY_KEY_SECRET = prevCheckout;
  env.RAZORPAY_WEBHOOK_SECRET = prevWebhook;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await Payment.deleteMany({});
  await Notification.deleteMany({});
  await ParkingSpace.updateOne({ _id: spaceId }, { $set: { bookingsCount: 0 } });
});

function assertReconciled(
  payment: { status?: string; refundStatus?: string | null } | null,
  bookingStatus: string
) {
  const confirmed = ["CONFIRMED", "ACTIVE", "COMPLETED"].includes(bookingStatus);
  const refunded = payment?.status === "REFUNDED" || payment?.refundStatus === "PENDING" || payment?.refundStatus === "PROCESSED";
  assert.ok(confirmed || refunded, "paid driver must have a confirmed booking or a tracked refund");
}

describe("captured payment after expiry or cancel", () => {
  it("confirms an expired hold when the slot is still free", async () => {
    const { booking } = await seedHold({ expired: true });
    const result = await settleCapturedPayment(String(booking._id), "pay_late_ok", "sig", {
      notify: async () => undefined,
      refundPayment: async () => {
        throw new Error("refund should not run when the slot is free");
      },
    });
    assert.equal(result.outcome, "confirmed");
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "CONFIRMED");
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "PAID");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
  });

  it("refunds an expired hold when the slot is no longer available", async () => {
    const { booking } = await seedHold({ expired: true, amount: 7350 });
    await occupySlot(booking.start, booking.end);
    const calls: { paymentId: string; amount: number }[] = [];
    const result = await settleCapturedPayment(String(booking._id), "pay_late_busy", "sig", {
      notify: async () => undefined,
      refundPayment: async (paymentId, amount) => {
        calls.push({ paymentId, amount });
        return { refundId: "rfnd_busy", processed: true };
      },
    });
    assert.equal(result.outcome, "refunded");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.paymentId, "pay_late_busy");
    assert.equal(calls[0]?.amount, 7350);
    const fresh = await Booking.findById(booking._id);
    assert.ok(fresh?.status === "EXPIRED" || fresh?.status === "PENDING" || fresh?.status === "CANCELLED");
    assert.notEqual(fresh?.status, "CONFIRMED");
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assert.equal(payment?.refundStatus, "PROCESSED");
    assert.equal(payment?.refundAmount, 7350);
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 0);
    assertReconciled(payment, fresh!.status);
  });

  it("refunds a captured payment for a cancelled booking", async () => {
    const { booking } = await seedHold({ cancelled: true, amount: 8200 });
    const result = await settleCapturedPayment(String(booking._id), "pay_after_cancel", "sig", {
      notify: async () => undefined,
      refundPayment: async (_id, amount) => {
        assert.equal(amount, 8200);
        return { refundId: "rfnd_cancel", processed: true };
      },
    });
    assert.equal(result.outcome, "refunded");
    assert.equal((await Booking.findById(booking._id))?.status, "CANCELLED");
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assert.equal(payment?.refundId, "rfnd_cancel");
    assertReconciled(payment, "CANCELLED");
  });

  it("acknowledges a late-capture webhook with HTTP 200 after recording a refund", async () => {
    const { booking, orderId } = await seedHold({ cancelled: true });
    const { req } = captureWebhook(orderId, "pay_wh_late");
    const res = jsonRes();
    await webhook(req, res, {
      notify: async () => undefined,
      refundPayment: async () => ({ refundId: "rfnd_wh", processed: true }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal((res.body as { success?: boolean }).success, true);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.refundStatus, "PROCESSED");
    assert.equal((await Booking.findById(booking._id))?.status, "CANCELLED");
    assertReconciled(payment, "CANCELLED");
  });

  it("does not acknowledge a webhook when the refund was not safely recorded", async () => {
    const { orderId } = await seedHold({ cancelled: true });
    const { req } = captureWebhook(orderId, "pay_wh_fail");
    const res = jsonRes();
    await assert.rejects(
      () =>
        webhook(req, res, {
          notify: async () => undefined,
          refundPayment: async () => {
            throw new Error("gateway down");
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 503
    );
    assert.notEqual(res.statusCode === 200 && (res.body as { success?: boolean })?.success === true, true);
    const payment = await Payment.findOne({ orderId });
    assert.notEqual(payment?.status, "REFUNDED");
  });

  it("duplicate late-capture webhooks refund once and return 200 both times", async () => {
    const { booking, orderId } = await seedHold({ cancelled: true });
    let calls = 0;
    const deps = {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        return { refundId: "rfnd_dup", processed: true };
      },
    };
    const first = captureWebhook(orderId, "pay_dup_late");
    const second = captureWebhook(orderId, "pay_dup_late");
    const a = jsonRes();
    const b = jsonRes();
    await webhook(first.req, a, deps);
    await webhook(second.req, b, deps);
    assert.equal(a.statusCode, 200);
    assert.equal(b.statusCode, 200);
    assert.equal(calls, 1);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.refundId, "rfnd_dup");
  });

  it("lets only one concurrent late-payment settlement create a Razorpay refund", async () => {
    const { booking } = await seedHold({ cancelled: true });
    let calls = 0;
    const deps = {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { refundId: `rfnd_${calls}`, processed: true };
      },
    };
    const results = await Promise.all([
      settleCapturedPayment(String(booking._id), "pay_race", "sig", deps),
      settleCapturedPayment(String(booking._id), "pay_race", "sig", deps),
    ]);
    assert.ok(results.every((r) => r.outcome === "refunded" || r.outcome === "refund_pending"));
    assert.equal(calls, 1);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assertReconciled(payment, "CANCELLED");
  });

  it("does not create a second refund after a timeout when Razorpay already has one", async () => {
    const { booking } = await seedHold({ expired: true });
    await occupySlot(booking.start, booking.end);
    let creates = 0;
    await assert.rejects(
      () =>
        settleCapturedPayment(String(booking._id), "pay_timeout", "sig", {
          notify: async () => undefined,
          refundPayment: async () => {
            creates += 1;
            throw new Error("timeout contacting Razorpay");
          },
          listRefunds: async () => {
            throw new Error("timeout listing refunds");
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 503
    );
    const midway = await Payment.findOne({ bookingId: booking._id });
    assert.notEqual(midway?.status, "REFUNDED");
    const retry = await settleCapturedPayment(String(booking._id), "pay_timeout", "sig", {
      notify: async () => undefined,
      refundPayment: async () => {
        creates += 1;
        return { refundId: "rfnd_should_not", processed: true };
      },
      listRefunds: async () => [{ refundId: "rfnd_existing", processed: true }],
    });
    assert.ok(retry.outcome === "refunded" || retry.outcome === "refund_pending");
    assert.equal(creates, 1);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.refundId, "rfnd_existing");
    assertReconciled(payment, (await Booking.findById(booking._id))!.status);
  });

  it("verify returns a recorded refund instead of leaving a paid driver unconfirmed", async () => {
    const { booking, orderId } = await seedHold({ cancelled: true });
    const paymentId = "pay_verify_late";
    const signature = checkoutSignature(orderId, paymentId, CHECKOUT_SECRET);
    const req = {
      userId: String(ownerId),
      body: {
        bookingId: String(booking._id),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    } as AuthedRequest;
    const res = jsonRes();
    await verify(req, res, {
      notify: async () => undefined,
      refundPayment: async () => ({ refundId: "rfnd_verify", processed: true }),
    });
    assert.equal(res.statusCode, 200);
    const body = res.body as { data?: { refunded?: boolean; refundStatus?: string } };
    assert.equal(body.data?.refunded, true);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assert.equal((await Booking.findById(booking._id))?.status, "CANCELLED");
    assertReconciled(payment, "CANCELLED");
  });

  it("does not flip a refunded payment back to PAID when a late capture arrives", async () => {
    const { booking } = await seedHold();
    await Booking.updateOne({ _id: booking._id }, { $set: { status: "CONFIRMED" }, $unset: { expiresAt: 1 } });
    await Payment.updateOne(
      { bookingId: booking._id },
      { $set: { status: "REFUNDED", refundStatus: "PROCESSED", paymentId: "pay_already_rfnd" } }
    );
    const result = await settleCapturedPayment(String(booking._id), "pay_late_replay", "sig", {
      notify: async () => undefined,
      refundPayment: async () => {
        throw new Error("must not refund again");
      },
    });
    assert.equal(result.outcome, "already_paid");
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assert.equal(payment?.refundStatus, "PROCESSED");
    assertReconciled(payment, "CONFIRMED");
  });
});

describe("cancel unpaid Razorpay orders", () => {
  it("cancels the unpaid Razorpay order when the driver cancels a pending hold", async () => {
    const { booking, orderId } = await seedHold();
    const cancelled: string[] = [];
    await cancelBooking(String(booking._id), String(ownerId), false, {
      notify: async () => undefined,
      cancelOrder: async (id) => {
        cancelled.push(id);
        return "cancelled";
      },
    });
    assert.deepEqual(cancelled, [orderId]);
    assert.equal((await Booking.findById(booking._id))?.status, "CANCELLED");
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "CREATED");
  });

  it("cancels the unpaid Razorpay order when an expired hold is released", async () => {
    const { booking, orderId } = await seedHold({ expired: true });
    const { releaseExpiredPaymentHold } = await import("./bookings.js");
    const cancelled: string[] = [];
    await releaseExpiredPaymentHold(String(booking._id), {
      cancelOrder: async (id) => {
        cancelled.push(id);
        return "cancelled";
      },
    });
    assert.deepEqual(cancelled, [orderId]);
    assert.equal((await Booking.findById(booking._id))?.status, "EXPIRED");
  });

  it("returns globally expired hold ids so unpaid orders can be reconciled", async () => {
    const { booking } = await seedHold({ expired: true });
    const ids = await expireStalePendingBookings();
    assert.ok(ids.includes(String(booking._id)));
    assert.equal((await Booking.findById(booking._id))?.status, "EXPIRED");
  });

  it("reconciles unpaid expired orders and does not retry unsupported cancels", async () => {
    const { booking, orderId } = await seedHold({ expired: true });
    await expireStalePendingBookings();
    const attempts: string[] = [];
    await reconcileExpiredPaymentHolds({
      cancelOrder: async (id) => {
        attempts.push(id);
        return "unsupported";
      },
    });
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "CREATED");
    assert.equal(payment?.orderCancelStatus, "unsupported");
    await reconcileExpiredPaymentHolds({
      cancelOrder: async (id) => {
        attempts.push(id);
        return "cancelled";
      },
    });
    assert.deepEqual(attempts, [orderId]);
  });

  it("retries a skipped order-cancel on the next reconcile pass", async () => {
    const { booking, orderId } = await seedHold({ expired: true });
    await expireStalePendingBookings();
    const attempts: string[] = [];
    await reconcileExpiredPaymentHolds({
      cancelOrder: async (id) => {
        attempts.push(id);
        return "skipped";
      },
    });
    await reconcileExpiredPaymentHolds({
      cancelOrder: async (id) => {
        attempts.push(id);
        return "cancelled";
      },
    });
    assert.deepEqual(attempts, [orderId, orderId]);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.orderCancelStatus, "cancelled");
  });
});
