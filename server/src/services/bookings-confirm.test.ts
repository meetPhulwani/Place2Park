import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, Notification, Payment, ParkingSpace } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { confirmBookingPaid } from "./bookings.js";
import { verify, webhook } from "../controllers/payments.controller.js";
import { env } from "../config/env.js";
import { checkoutSignature, webhookSignature } from "./payments.js";
import type { AuthedRequest } from "../middleware/auth.js";
import type { Request, Response } from "express";

const ownerId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();

let memory: MongoMemoryServer;
let spaceId: mongoose.Types.ObjectId;

const ACCESS = "654321";
const CHECKOUT_SECRET = "confirm_test_checkout_secret";
const WEBHOOK_SECRET = "confirm_test_webhook_secret";

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

async function seedPending(opts?: { expired?: boolean; orderId?: string; bookingsCount?: number }) {
  const start = hoursFromNow(3);
  const booking = await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: ownerId,
    spaceId,
    hostId,
    start,
    end: new Date(start.getTime() + 2 * 3600000),
    durationMins: 120,
    status: "PENDING",
    expiresAt: opts?.expired ? new Date(Date.now() - 60_000) : new Date(Date.now() + 12 * 60_000),
    vehicleType: "CAR",
    accessCode: ACCESS,
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: 7350,
    platformFee: 1050,
    hostEarning: 5950,
  });
  const orderId = opts?.orderId ?? `order_${booking._id.toString().slice(-10)}`;
  await Payment.create({
    bookingId: booking._id,
    provider: "RAZORPAY",
    orderId,
    amount: 7350,
    currency: "INR",
    status: "CREATED",
  });
  if (opts?.bookingsCount != null) {
    await ParkingSpace.updateOne({ _id: spaceId }, { $set: { bookingsCount: opts.bookingsCount } });
  }
  return { booking, orderId };
}

const prevCheckout = env.RAZORPAY_KEY_SECRET;
const prevWebhook = env.RAZORPAY_WEBHOOK_SECRET;

before(async () => {
  env.RAZORPAY_KEY_SECRET = CHECKOUT_SECRET;
  env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-confirm-test"));
  const space = await ParkingSpace.create({
    hostId,
    title: "Confirm test space",
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

describe("confirmBookingPaid idempotency", () => {

  it("confirms a pending booking, marks payment PAID, and increments bookingsCount once", async () => {
    const { booking } = await seedPending();
    const notifies: string[] = [];
    const result = await confirmBookingPaid(String(booking._id), "pay_ok", "sig_ok", {
      notify: async (userId, type) => {
        notifies.push(`${String(userId)}:${type}`);
      },
    });
    assert.equal(result.status, "CONFIRMED");
    assert.equal(result.accessCode, ACCESS);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "PAID");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal(notifies.length, 2);
    assert.ok(notifies.some((n) => n.endsWith("BOOKING_CONFIRMED")));
    assert.ok(notifies.some((n) => n.endsWith("HOST_NEW_BOOKING")));
  });

  it("duplicate confirmation does not increment bookingsCount or notify again", async () => {
    const { booking } = await seedPending();
    const notifies: string[] = [];
    const deps = {
      notify: async (userId: string, type: string) => {
        notifies.push(`${userId}:${type}`);
      },
    };
    await confirmBookingPaid(String(booking._id), "pay_dup", "sig_1", deps);
    await confirmBookingPaid(String(booking._id), "pay_dup", "sig_2", deps);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");
    assert.equal((await Booking.findById(booking._id))?.accessCode, ACCESS);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "PAID");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal(notifies.length, 2);
  });

  it("concurrent confirmation (verify + webhook) increments bookingsCount exactly once", async () => {
    const { booking } = await seedPending();
    const notifies: string[] = [];
    const deps = {
      notify: async (_userId: string, type: string) => {
        notifies.push(type);
        await new Promise((r) => setTimeout(r, 30));
      },
    };
    const results = await Promise.all([
      confirmBookingPaid(String(booking._id), "pay_race", "sig_v", deps),
      confirmBookingPaid(String(booking._id), "pay_race", "sig_w", deps),
    ]);
    assert.ok(results.every((b) => ["CONFIRMED", "ACTIVE", "COMPLETED"].includes(b.status)));
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "PAID");
    assert.equal(notifies.length, 2);
  });

  it("does not confirm an expired hold", async () => {
    const { booking } = await seedPending({ expired: true });
    await assert.rejects(
      () => confirmBookingPaid(String(booking._id), "pay_exp", "sig"),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    assert.equal((await Booking.findById(booking._id))?.status, "PENDING");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 0);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "CREATED");
  });

  it("does not confirm a cancelled booking", async () => {
    const { booking } = await seedPending();
    await Booking.updateOne({ _id: booking._id }, { $set: { status: "CANCELLED" } });
    await assert.rejects(
      () => confirmBookingPaid(String(booking._id), "pay_x", "sig"),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 0);
  });
});

describe("payment verify and webhook confirmation paths", () => {

  it("duplicate verify is idempotent and increments bookingsCount once", async () => {
    const { booking, orderId } = await seedPending();
    const paymentId = "pay_verify_1";
    const signature = checkoutSignature(orderId, paymentId, CHECKOUT_SECRET);
    const body = {
      bookingId: String(booking._id),
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    };
    const req = { userId: String(ownerId), body } as AuthedRequest;
    const first = jsonRes();
    await verify(req, first);
    const second = jsonRes();
    await verify(req, second);
    assert.equal(first.statusCode, 200);
    assert.equal((first.body as { data?: { alreadyPaid?: boolean } }).data?.alreadyPaid, false);
    assert.equal(second.statusCode, 200);
    assert.equal((second.body as { data?: { alreadyPaid?: boolean } }).data?.alreadyPaid, true);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal(await Notification.countDocuments({ "data.bookingId": String(booking._id) }), 2);
  });

  it("duplicate webhook delivery confirms once", async () => {
    const { booking, orderId } = await seedPending();
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_wh_1", order_id: orderId } } },
    });
    const sig = webhookSignature(raw, WEBHOOK_SECRET);
    const makeReq = () =>
      ({
        headers: { "x-razorpay-signature": sig },
        rawBody: raw,
      }) as unknown as Request & { rawBody: string };

    const first = jsonRes();
    await webhook(makeReq(), first);
    const second = jsonRes();
    await webhook(makeReq(), second);
    assert.equal(first.statusCode, 200);
    assert.equal(second.statusCode, 200);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "PAID");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal(await Notification.countDocuments({ "data.bookingId": String(booking._id) }), 2);
  });

  it("concurrent verify and webhook increment bookingsCount once", async () => {
    const { booking, orderId } = await seedPending();
    const paymentId = "pay_both";
    const signature = checkoutSignature(orderId, paymentId, CHECKOUT_SECRET);
    const verifyReq = {
      userId: String(ownerId),
      body: {
        bookingId: String(booking._id),
        razorpayOrderId: orderId,
        razorpayPaymentId: paymentId,
        razorpaySignature: signature,
      },
    } as AuthedRequest;
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
    const webhookReq = {
      headers: { "x-razorpay-signature": webhookSignature(raw, WEBHOOK_SECRET) },
      rawBody: raw,
    } as unknown as Request & { rawBody: string };

    const vRes = jsonRes();
    const wRes = jsonRes();
    await Promise.all([verify(verifyReq, vRes), webhook(webhookReq, wRes)]);
    assert.equal(vRes.statusCode, 200);
    assert.equal(wRes.statusCode, 200);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");
    assert.equal((await ParkingSpace.findById(spaceId))?.bookingsCount, 1);
    assert.equal(await Notification.countDocuments({ "data.bookingId": String(booking._id) }), 2);
  });
});
