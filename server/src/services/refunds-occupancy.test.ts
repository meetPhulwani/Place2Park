import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, HostPayout, ParkingSpace, Payment } from "../models/index.js";
import { hasConflict, progressBookingStatuses, progressOneBooking } from "./availability.js";
import { applyRefundEvent } from "./payments.js";
import { listEligibleBookings } from "./payouts.js";

const driverId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();

let memory: MongoMemoryServer;
let spaceId: mongoose.Types.ObjectId;

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 3600000);
}

async function seedPaid(opts: { status: "CONFIRMED" | "ACTIVE" | "COMPLETED"; start: Date }) {
  const booking = await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: driverId,
    spaceId,
    hostId,
    start: opts.start,
    end: new Date(opts.start.getTime() + 2 * 3600000),
    durationMins: 120,
    status: opts.status,
    vehicleType: "CAR",
    accessCode: "123456",
    baseAmount: 7000,
    serviceFee: 350,
    totalAmount: 7350,
    platformFee: 1050,
    hostEarning: 5950,
  });
  await Payment.create({
    bookingId: booking._id,
    provider: "RAZORPAY",
    orderId: `order_${booking._id.toString().slice(-8)}`,
    paymentId: `pay_${booking._id.toString().slice(-8)}`,
    amount: 7350,
    status: "PAID",
  });
  return booking;
}

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-refund-occ-test"));
  const space = await ParkingSpace.create({
    hostId,
    title: "Refund occupancy space",
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
  await HostPayout.deleteMany({});
});

describe("dashboard refund occupancy", () => {
  it("cancels a future confirmed booking after refund.processed and frees the slot", async () => {
    const booking = await seedPaid({ status: "CONFIRMED", start: hoursFromNow(5) });
    await applyRefundEvent({
      event: "refund.processed",
      refundId: "rfnd_dash",
      paymentId: `pay_${booking._id.toString().slice(-8)}`,
    });
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.refunded, true);
    assert.equal(fresh?.status, "CANCELLED");
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.status, "REFUNDED");
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), false);
    assert.equal((await listEligibleBookings(String(hostId))).length, 0);
  });

  it("keeps an in-progress booking active after a refund but excludes it from payouts", async () => {
    const booking = await seedPaid({ status: "ACTIVE", start: new Date(Date.now() - 30 * 60000) });
    await applyRefundEvent({
      event: "refund.processed",
      refundId: "rfnd_active",
      paymentId: `pay_${booking._id.toString().slice(-8)}`,
    });
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "ACTIVE");
    assert.equal(fresh?.refunded, true);
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), true);
    assert.equal((await listEligibleBookings(String(hostId))).length, 0);
  });

  it("is idempotent and still reconciles occupancy on a duplicate refund webhook", async () => {
    const booking = await seedPaid({ status: "CONFIRMED", start: hoursFromNow(4) });
    const payload = {
      event: "refund.processed" as const,
      refundId: "rfnd_dup",
      paymentId: `pay_${booking._id.toString().slice(-8)}`,
    };
    await applyRefundEvent(payload);
    await applyRefundEvent(payload);
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "CANCELLED");
    assert.equal(fresh?.refunded, true);
    assert.equal(await Payment.countDocuments({ bookingId: booking._id, status: "REFUNDED" }), 1);
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), false);
  });

  it("does not leave a refunded CONFIRMED booking occupying after its window has ended", async () => {
    const start = new Date(Date.now() - 5 * 3600000);
    const booking = await seedPaid({ status: "CONFIRMED", start });
    await applyRefundEvent({
      event: "refund.processed",
      refundId: "rfnd_past",
      paymentId: `pay_${booking._id.toString().slice(-8)}`,
    });
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), false);
    const fresh = await Booking.findById(booking._id);
    assert.notEqual(fresh?.status, "ACTIVE");
    assert.equal(fresh?.refunded, true);
  });

  it("does not promote an already-refunded CONFIRMED booking into an occupying ACTIVE stay", async () => {
    const start = new Date(Date.now() - 30 * 60000);
    const booking = await seedPaid({ status: "CONFIRMED", start });
    await Booking.updateOne({ _id: booking._id }, { $set: { refunded: true } });
    await progressBookingStatuses();
    await progressOneBooking(String(booking._id));
    const fresh = await Booking.findById(booking._id);
    assert.notEqual(fresh?.status, "ACTIVE");
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), false);
  });

  it("still occupies a legitimate non-refunded stay after start time", async () => {
    const start = new Date(Date.now() - 30 * 60000);
    const booking = await seedPaid({ status: "CONFIRMED", start });
    await progressOneBooking(String(booking._id));
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.status, "ACTIVE");
    assert.equal(await hasConflict(String(spaceId), booking.start, booking.end), true);
  });
});
