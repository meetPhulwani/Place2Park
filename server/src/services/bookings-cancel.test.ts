import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, Payment, ParkingSpace } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { cancelBooking } from "./bookings.js";
import { applyRefundEvent } from "./payments.js";

const ownerId = new mongoose.Types.ObjectId();
const otherId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();

let memory: MongoMemoryServer;
let spaceId: mongoose.Types.ObjectId;

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600000);
}

async function seedBooking(opts: {
  status: "PENDING" | "CONFIRMED" | "ACTIVE" | "CANCELLED";
  start: Date;
  paid?: boolean;
  paymentStatus?: "CREATED" | "PAID" | "FAILED" | "REFUNDED";
  refundStatus?: "PENDING" | "PROCESSED" | "FAILED";
  refundId?: string;
  paymentId?: string;
  amount?: number;
}) {
  const start = opts.start;
  const booking = await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: ownerId,
    spaceId,
    hostId,
    start,
    end: new Date(start.getTime() + 2 * 3600000),
    durationMins: 120,
    status: opts.status,
    vehicleType: "CAR",
    accessCode: "123456",
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: 7350,
    platformFee: 1050,
    hostEarning: 5950,
    refunded: opts.paymentStatus === "REFUNDED",
  });
  if (opts.paid || opts.paymentStatus) {
    await Payment.create({
      bookingId: booking._id,
      provider: "RAZORPAY",
      orderId: "order_test_1",
      paymentId: opts.paymentId ?? "pay_test_1",
      amount: opts.amount ?? 7350,
      currency: "INR",
      status: opts.paymentStatus ?? "PAID",
      refundStatus: opts.refundStatus,
      refundId: opts.refundId,
    });
  } else {
    await Payment.create({
      bookingId: booking._id,
      provider: "RAZORPAY",
      orderId: "order_test_hold",
      amount: 7350,
      status: "CREATED",
    });
  }
  return booking;
}

describe("cancelBooking Razorpay refunds", () => {
  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    await mongoose.connect(memory.getUri("parkly-refund-test"));
    const space = await ParkingSpace.create({
      hostId,
      title: "Refund test space",
      address: "Hidden",
      area: "BKC",
      city: "Mumbai",
      location: { type: "Point", coordinates: [72.87, 19.06] },
      pricePerHour: 3500,
      status: "VERIFIED",
    });
    spaceId = space._id as mongoose.Types.ObjectId;
  });

  after(async () => {
    await mongoose.disconnect();
    await memory.stop();
  });

  beforeEach(async () => {
    await Booking.deleteMany({});
    await Payment.deleteMany({});
  });

  it("refunds an eligible paid booking through Razorpay using the Mongo amount", async () => {
    const booking = await seedBooking({ status: "CONFIRMED", start: hoursFromNow(3), paid: true, amount: 7350 });
    const calls: { paymentId: string; amount: number }[] = [];
    const result = await cancelBooking(String(booking._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async (paymentId, amount) => {
        calls.push({ paymentId, amount });
        return { refundId: "rfnd_ok", processed: true };
      },
    });
    assert.equal(result.refunded, true);
    assert.equal(result.refundStatus, "PROCESSED");
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.paymentId, "pay_test_1");
    assert.equal(calls[0]?.amount, 7350);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
    assert.equal(payment?.refundId, "rfnd_ok");
    assert.equal(payment?.refundStatus, "PROCESSED");
    assert.equal(payment?.refundAmount, 7350);
    assert.ok(payment?.refundRequestedAt instanceof Date);
    assert.ok(payment?.refundProcessedAt instanceof Date);
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "CANCELLED");
    assert.equal(fresh?.refunded, true);
  });

  it("does not refund when the stored Razorpay payment id is missing and cannot be resolved", async () => {
    const booking = await seedBooking({
      status: "CONFIRMED",
      start: hoursFromNow(3),
      paid: true,
      paymentId: "",
    });
    let calls = 0;
    await assert.rejects(
      () =>
        cancelBooking(String(booking._id), String(ownerId), false, {
          notify: async () => undefined,
          refundPayment: async () => {
            calls += 1;
            return { refundId: "rfnd_no", processed: true };
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 503
    );
    assert.equal(calls, 0);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "PAID");
    assert.equal(payment?.refundStatus, "FAILED");
    assert.equal((await Booking.findById(booking._id))?.status, "CANCELLED");
  });

  it("does not mark REFUNDED when Razorpay fails", async () => {
    const booking = await seedBooking({ status: "CONFIRMED", start: hoursFromNow(3), paid: true });
    await assert.rejects(
      () =>
        cancelBooking(String(booking._id), String(ownerId), false, {
          notify: async () => undefined,
          refundPayment: async () => {
            throw new Error("gateway down");
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 503
    );
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "PAID");
    assert.equal(payment?.refundStatus, "FAILED");
    assert.equal(payment?.refundId, undefined);
    assert.ok(payment?.refundFailedAt instanceof Date);
    assert.equal(payment?.refundProcessedAt, undefined);
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "CANCELLED");
    assert.equal(fresh?.refunded, false);
  });

  it("retries a failed refund on repeated cancellation without creating a second Razorpay refund after success", async () => {
    const booking = await seedBooking({
      status: "CONFIRMED",
      start: hoursFromNow(4),
      paid: true,
      refundStatus: "FAILED",
    });
    let calls = 0;
    const first = await cancelBooking(String(booking._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        return { refundId: "rfnd_retry", processed: true };
      },
    });
    assert.equal(first.refunded, true);
    const second = await cancelBooking(String(booking._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        return { refundId: "rfnd_should_not", processed: true };
      },
    });
    assert.equal(second.refunded, true);
    assert.equal(calls, 1);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.refundId, "rfnd_retry");
  });

  it("lets only one concurrent cancel create a Razorpay refund", async () => {
    const booking = await seedBooking({ status: "CONFIRMED", start: hoursFromNow(5), paid: true });
    let calls = 0;
    const deps = {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return { refundId: `rfnd_${calls}`, processed: true };
      },
    };
    const results = await Promise.allSettled([
      cancelBooking(String(booking._id), String(ownerId), false, deps),
      cancelBooking(String(booking._id), String(ownerId), false, deps),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ refunded: boolean }>[];
    assert.ok(fulfilled.length >= 1);
    assert.equal(fulfilled.every((r) => r.value.refunded), true);
    assert.equal(calls, 1);
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "REFUNDED");
  });

  it("does not refund ineligible cancellations", async () => {
    const soon = await seedBooking({ status: "CONFIRMED", start: hoursFromNow(0.25), paid: true });
    let calls = 0;
    const close = await cancelBooking(String(soon._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        return { refundId: "rfnd_no", processed: true };
      },
    });
    assert.equal(close.refunded, false);
    assert.equal(close.refundStatus, null);
    assert.equal((await Payment.findOne({ bookingId: soon._id }))?.status, "PAID");

    const pending = await seedBooking({ status: "PENDING", start: hoursFromNow(3) });
    const unpaid = await cancelBooking(String(pending._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async () => {
        calls += 1;
        return { refundId: "rfnd_no", processed: true };
      },
    });
    assert.equal(unpaid.refunded, false);

    const started = await seedBooking({
      status: "CONFIRMED",
      start: new Date(Date.now() - 60000),
      paid: true,
    });
    await assert.rejects(
      () =>
        cancelBooking(String(started._id), String(ownerId), false, {
          notify: async () => undefined,
          refundPayment: async () => {
            calls += 1;
            return { refundId: "rfnd_no", processed: true };
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );

    await assert.rejects(
      () =>
        cancelBooking(String(pending._id), String(otherId), false, {
          notify: async () => undefined,
          refundPayment: async () => {
            calls += 1;
            return { refundId: "rfnd_no", processed: true };
          },
        }),
      (err: unknown) => err instanceof ApiError && err.status === 403
    );
    assert.equal(calls, 0);
  });

  it("keeps a pending Razorpay refund as PAID until the refund is processed", async () => {
    const booking = await seedBooking({ status: "CONFIRMED", start: hoursFromNow(3), paid: true });
    const result = await cancelBooking(String(booking._id), String(ownerId), false, {
      notify: async () => undefined,
      refundPayment: async () => ({ refundId: "rfnd_pend", processed: false }),
    });
    assert.equal(result.refunded, true);
    assert.equal(result.refundStatus, "PENDING");
    const payment = await Payment.findOne({ bookingId: booking._id });
    assert.equal(payment?.status, "PAID");
    assert.equal(payment?.refundStatus, "PENDING");
    assert.equal(payment?.refundId, "rfnd_pend");
    assert.equal(payment?.refundAmount, 7350);
    assert.ok(payment?.refundRequestedAt instanceof Date);
    assert.equal(payment?.refundProcessedAt, undefined);
    assert.equal((await Booking.findById(booking._id))?.refunded, false);
    await applyRefundEvent({
      event: "refund.processed",
      refundId: "rfnd_pend",
      paymentId: "pay_test_1",
    });
    const after = await Payment.findOne({ bookingId: booking._id });
    assert.equal(after?.status, "REFUNDED");
    assert.equal(after?.refundStatus, "PROCESSED");
    assert.ok(after?.refundProcessedAt instanceof Date);
    assert.equal((await Booking.findById(booking._id))?.refunded, true);
  });
});
