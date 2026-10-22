import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, HostPayout, ParkingSpace, Payment, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { authorize, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { computeQuote } from "../utils/pricing.js";
import {
  applyRouteTransferEvent,
  listEligibleBookings,
  markHostPayoutPaid,
  approveHostPayout,
  failHostPayout,
  publicPayoutProfile,
  reconcileRefundedBooking,
  requestHostPayout,
  saveHostPayoutProfile,
  summarizeHostEarnings,
  verifyHostPayoutProfile,
} from "./payouts.js";

const prevJwt = env.JWT_SECRET;
let memory: MongoMemoryServer;
let hostId: string;
let adminId: string;
let driverId: string;
let spaceId: mongoose.Types.ObjectId;

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3600000);
}

async function seedBooking(opts: {
  status: "CONFIRMED" | "ACTIVE" | "COMPLETED" | "CANCELLED";
  paymentStatus?: "CREATED" | "PAID" | "FAILED" | "REFUNDED";
  refundStatus?: "PENDING" | "PROCESSED" | "FAILED";
  refunded?: boolean;
  hostEarning?: number;
}) {
  const start = hoursAgo(48);
  const quote = computeQuote(3500, 120);
  const booking = await Booking.create({
    code: `PK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    userId: driverId,
    spaceId,
    hostId,
    start,
    end: new Date(start.getTime() + 2 * 3600000),
    durationMins: 120,
    status: opts.status,
    vehicleType: "CAR",
    accessCode: "123456",
    baseAmount: quote.baseAmount,
    serviceFee: quote.serviceFee,
    totalAmount: quote.totalAmount,
    platformFee: quote.platformFee,
    hostEarning: opts.hostEarning ?? quote.hostEarning,
    refunded: opts.refunded ?? opts.paymentStatus === "REFUNDED",
  });
  await Payment.create({
    bookingId: booking._id,
    provider: "RAZORPAY",
    orderId: `order_${booking._id.toString().slice(-8)}`,
    paymentId: `pay_${booking._id.toString().slice(-8)}`,
    amount: quote.totalAmount,
    currency: "INR",
    status: opts.paymentStatus ?? "PAID",
    refundStatus: opts.refundStatus,
  });
  return booking;
}

async function readyHost() {
  await saveHostPayoutProfile(hostId, {
    accountHolder: "Priya Sharma",
    ifsc: "HDFC0001234",
    accountNumber: "123456789012",
  });
  await verifyHostPayoutProfile(adminId, hostId, true);
}

before(async () => {
  env.JWT_SECRET = prevJwt || "payout-test-secret-which-is-long-enough";
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-payout-test"));
  const [host, admin, driver] = await User.create([
    { name: "Host User", email: "host-payout@parkly.test", role: "HOST" },
    { name: "Admin User", email: "admin-payout@parkly.test", role: "ADMIN" },
    { name: "Driver User", email: "driver-payout@parkly.test", role: "DRIVER" },
  ]);
  hostId = String(host._id);
  adminId = String(admin._id);
  driverId = String(driver._id);
  const space = await ParkingSpace.create({
    hostId,
    title: "Payout test space",
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
  env.JWT_SECRET = prevJwt;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await Booking.deleteMany({});
  await Payment.deleteMany({});
  await HostPayout.deleteMany({});
  await User.updateOne(
    { _id: hostId },
    { $unset: { payoutProfile: 1 } }
  );
});

describe("payout eligibility and commission", () => {
  it("does not treat a completed booking as paid out", async () => {
    const booking = await seedBooking({ status: "COMPLETED", paymentStatus: "PAID" });
    const summary = await summarizeHostEarnings(hostId);
    assert.equal(summary.calculatedCompleted, booking.hostEarning);
    assert.equal(summary.paidAmount, 0);
    assert.equal(summary.automaticTransfers, false);
    assert.equal(summary.eligibleAmount, booking.hostEarning);
  });

  it("uses computeQuote hostEarning (10% host commission) as the payout amount", async () => {
    const quote = computeQuote(3500, 120);
    assert.equal(quote.hostEarning, quote.baseAmount - quote.platformFee);
    const booking = await seedBooking({ status: "COMPLETED" });
    await readyHost();
    const payout = await requestHostPayout(hostId);
    assert.equal(payout.amount, quote.hostEarning);
    assert.equal(payout.amount, booking.hostEarning);
    assert.equal(payout.currency, "INR");
    assert.equal(payout.method, "MANUAL");
  });

  it("excludes upcoming, refunded, and in-flight-refund bookings from eligible balance", async () => {
    await seedBooking({ status: "CONFIRMED", paymentStatus: "PAID" });
    await seedBooking({ status: "COMPLETED", paymentStatus: "REFUNDED", refunded: true });
    await seedBooking({ status: "COMPLETED", paymentStatus: "PAID", refundStatus: "PENDING" });
    const eligible = await listEligibleBookings(hostId);
    assert.equal(eligible.length, 0);
  });
});

describe("host onboarding and request guards", () => {
  it("masks payout details and requires admin verification before a request", async () => {
    const profile = await saveHostPayoutProfile(hostId, {
      accountHolder: "Priya Sharma",
      ifsc: "HDFC0001234",
      accountNumber: "123456789012",
    });
    assert.equal(profile.accountLast4, "9012");
    assert.equal(profile.verified, false);
    assert.equal(JSON.stringify(profile).includes("123456789012"), false);
    await seedBooking({ status: "COMPLETED" });
    await assert.rejects(() => requestHostPayout(hostId), (err: unknown) => err instanceof ApiError && err.status === 400);
    await verifyHostPayoutProfile(adminId, hostId, true);
    const summary = await summarizeHostEarnings(hostId);
    assert.equal(summary.payoutProfile.verified, true);
    assert.equal("accountNumber" in summary.payoutProfile, false);
  });

  it("public profile helper never echoes the full account number", () => {
    const view = publicPayoutProfile({
      accountHolder: "Priya",
      ifsc: "HDFC0001234",
      accountLast4: "9012",
      verified: true,
    });
    assert.equal(view.accountLast4, "9012");
    assert.equal(JSON.stringify(view).includes("123456789012"), false);
  });
});

describe("idempotency and concurrency", () => {
  it("reuses the same payout for a duplicate request of the same bookings", async () => {
    await readyHost();
    await seedBooking({ status: "COMPLETED" });
    const first = await requestHostPayout(hostId);
    const second = await requestHostPayout(hostId);
    assert.equal(first.id, second.id);
    assert.equal(await HostPayout.countDocuments({ hostId }), 1);
    assert.equal(await Booking.countDocuments({ payoutId: first.id }), 1);
  });

  it("lets only one concurrent request claim the same eligible bookings", async () => {
    await readyHost();
    await seedBooking({ status: "COMPLETED" });
    const results = await Promise.allSettled([requestHostPayout(hostId), requestHostPayout(hostId)]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ id: string }>[];
    assert.ok(ok.length >= 1);
    const ids = new Set(ok.map((r) => r.value.id));
    assert.equal(ids.size, 1);
    assert.equal(await HostPayout.countDocuments({ hostId, status: "REQUESTED" }), 1);
  });
});

describe("admin approval, failure, and paid records", () => {
  it("does not mark PAID until an admin records a reference after approval", async () => {
    await readyHost();
    await seedBooking({ status: "COMPLETED" });
    const requested = await requestHostPayout(hostId);
    await assert.rejects(
      () => markHostPayoutPaid(adminId, requested.id, "NEFT123456"),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    const approved = await approveHostPayout(adminId, requested.id);
    assert.equal(approved.status, "APPROVED");
    await assert.rejects(
      () => markHostPayoutPaid(adminId, requested.id, "abc"),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    const paid = await markHostPayoutPaid(adminId, requested.id, "NEFT987654321");
    assert.equal(paid.status, "PAID");
    assert.equal(paid.reference, "NEFT987654321");
    assert.ok(paid.paidAt);
    const reloaded = await HostPayout.findById(requested.id);
    assert.equal(reloaded?.status, "PAID");
    assert.equal(reloaded?.currency, "INR");
    assert.ok((reloaded?.events ?? []).some((e) => e.status === "PAID"));
  });

  it("releases bookings after a failed transfer so they can be requested again", async () => {
    await readyHost();
    const booking = await seedBooking({ status: "COMPLETED" });
    const requested = await requestHostPayout(hostId);
    await failHostPayout(adminId, requested.id, "bank rejected");
    const fresh = await Booking.findById(booking._id);
    assert.equal(fresh?.payoutId, undefined);
    const again = await requestHostPayout(hostId);
    assert.equal(again.status, "REQUESTED");
    assert.notEqual(again.id, requested.id);
  });

  it("blocks non-admins from payout approval middleware", () => {
    let hostErr: unknown;
    authorize("ADMIN")({ userId: hostId, userRole: "HOST" } as AuthedRequest, {} as never, (err) => {
      hostErr = err;
    });
    assert.ok(hostErr instanceof ApiError && hostErr.status === 403);
  });
});

describe("refunds and reconciliation", () => {
  it("removes a refunded booking from an open payout and does not pay that amount", async () => {
    await readyHost();
    const booking = await seedBooking({ status: "COMPLETED" });
    const requested = await requestHostPayout(hostId);
    await Booking.updateOne({ _id: booking._id }, { $set: { refunded: true } });
    await Payment.updateOne({ bookingId: booking._id }, { $set: { status: "REFUNDED", refundStatus: "PROCESSED" } });
    await reconcileRefundedBooking(booking._id);
    const payout = await HostPayout.findById(requested.id);
    assert.equal(payout?.status, "REJECTED");
    assert.equal(payout?.amount, 0);
    const eligible = await listEligibleBookings(hostId);
    assert.equal(eligible.length, 0);
  });

  it("keeps a paid payout linked if a later refund arrives, without creating a second payout", async () => {
    await readyHost();
    const booking = await seedBooking({ status: "COMPLETED" });
    const requested = await requestHostPayout(hostId);
    await approveHostPayout(adminId, requested.id);
    await markHostPayoutPaid(adminId, requested.id, "NEFT11111111");
    await Booking.updateOne({ _id: booking._id }, { $set: { refunded: true } });
    await reconcileRefundedBooking(booking._id);
    const payout = await HostPayout.findById(requested.id);
    assert.equal(payout?.status, "PAID");
    assert.equal(await HostPayout.countDocuments({ hostId }), 1);
    assert.equal((await listEligibleBookings(hostId)).length, 0);
  });

  it("ignores Route transfer webhooks that do not match a stored transferId", async () => {
    await readyHost();
    await seedBooking({ status: "COMPLETED" });
    const requested = await requestHostPayout(hostId);
    await applyRouteTransferEvent({ event: "transfer.processed", transferId: "trf_unknown" });
    const payout = await HostPayout.findById(requested.id);
    assert.equal(payout?.status, "REQUESTED");
    assert.equal(payout?.transferId, undefined);
  });
});
