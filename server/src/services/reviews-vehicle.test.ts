import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AdminAudit, Booking, Notification, ParkingSpace, Review, ReviewRequest, User, VehicleCheck } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { progressOneBooking } from "./availability.js";
import { createBooking } from "./bookings.js";
import {
  assertCanTransact,
  ensureReviewRequests,
  reportReview,
  reviewSkipLimit,
  skipReviewRequest,
  submitBookingReview,
} from "./reviews.js";
import { recordVehicleCheck, verifyArrivalCode } from "./vehicle-arrival.js";

const driverId = new mongoose.Types.ObjectId();
const hostId = new mongoose.Types.ObjectId();
const strangerId = new mongoose.Types.ObjectId();

let memory: MongoMemoryServer;
let spaceId: mongoose.Types.ObjectId;

function money() {
  return { baseAmount: 20000, serviceFee: 1000, totalAmount: 21000, platformFee: 2000, hostEarning: 18000 };
}

async function seedBooking(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() - 3 * 3600000);
  return Booking.create({
    code: `PK-${new mongoose.Types.ObjectId().toString().slice(-6)}`,
    userId: driverId,
    spaceId,
    hostId,
    start,
    end: new Date(Date.now() - 3600000),
    durationMins: 120,
    status: "COMPLETED",
    vehicleType: "CAR",
    vehiclePlate: "KA01AB1234",
    accessCode: "654321",
    ...money(),
    ...overrides,
  });
}

describe("two-sided reviews and vehicle arrival", () => {
  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    await mongoose.connect(memory.getUri("parkly-reviews-vehicle"));
    await User.create([
      { _id: driverId, name: "Driver", email: "driver-review@parkly.test", role: "DRIVER" },
      { _id: hostId, name: "Host", email: "host-review@parkly.test", role: "HOST" },
      { _id: strangerId, name: "Other", email: "other-review@parkly.test", role: "HOST" },
    ]);
    const space = await ParkingSpace.create({
      hostId,
      title: "Review space",
      address: "Hidden",
      area: "Indiranagar",
      city: "Bengaluru",
      location: { type: "Point", coordinates: [77.64, 12.97] },
      pricePerHour: 10000,
      status: "VERIFIED",
    });
    spaceId = space._id as mongoose.Types.ObjectId;
  });

  after(async () => {
    await mongoose.disconnect();
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      Booking.deleteMany({}),
      Review.deleteMany({}),
      ReviewRequest.deleteMany({}),
      VehicleCheck.deleteMany({}),
      AdminAudit.deleteMany({}),
      Notification.deleteMany({}),
      User.updateMany({}, { $set: { reviewSkipCount: 0 } }),
      ParkingSpace.updateOne({ _id: spaceId }, { $set: { ratingAvg: 0, ratingCount: 0 } }),
    ]);
  });

  it("creates one request for each party only after a real completion", async () => {
    const done = await seedBooking({ status: "CONFIRMED" });
    const future = await seedBooking({
      status: "CONFIRMED",
      start: new Date(Date.now() - 60000),
      end: new Date(Date.now() + 3600000),
    });
    const cancelled = await seedBooking({ status: "CANCELLED", end: new Date(Date.now() - 1000) });

    await progressOneBooking(String(future._id));
    await progressOneBooking(String(cancelled._id));
    assert.equal(await ReviewRequest.countDocuments({}), 0);

    await progressOneBooking(String(done._id));
    await progressOneBooking(String(done._id));
    const requests = await ReviewRequest.find({ bookingId: done._id }).sort({ authorRole: 1 });
    assert.deepEqual(requests.map((row) => row.authorRole), ["DRIVER", "HOST"]);
    assert.equal(requests[0]?.status, "PENDING");
    assert.equal(await Notification.countDocuments({ type: "REVIEW_REMINDER" }), 2);

    await ensureReviewRequests([String(done._id), String(done._id)]);
    assert.equal(await ReviewRequest.countDocuments({ bookingId: done._id }), 2);
  });

  it("rejects ineligible, duplicate, and self reviews, and keeps host reviews off the space rating", async () => {
    const booking = await seedBooking();
    await ensureReviewRequests([String(booking._id)]);
    const pending = await seedBooking({ status: "CONFIRMED", end: new Date(Date.now() + 3600000) });
    await assert.rejects(() => submitBookingReview({ userId: String(driverId), bookingId: String(pending._id), rating: 5 }), (err: unknown) => err instanceof ApiError && err.status === 409);

    await assert.rejects(() => submitBookingReview({ userId: String(strangerId), bookingId: String(booking._id), rating: 4 }), (err: unknown) => err instanceof ApiError && err.status === 403);

    const driverReview = await submitBookingReview({
      userId: String(driverId),
      bookingId: String(booking._id),
      rating: 5,
      comment: "<script>alert(1)</script> Easy to find",
      categories: { access: 5, safety: 4 },
    });
    assert.equal(driverReview.comment, "alert(1) Easy to find");
    await assert.rejects(() => submitBookingReview({ userId: String(driverId), bookingId: String(booking._id), rating: 4 }), (err: unknown) => err instanceof ApiError && err.status === 409);

    await submitBookingReview({ userId: String(hostId), bookingId: String(booking._id), rating: 2, comment: "Late arrival" });
    const space = await ParkingSpace.findById(spaceId);
    assert.equal(space?.ratingCount, 1);
    assert.equal(space?.ratingAvg, 5);
    assert.equal(await Review.countDocuments({ bookingId: booking._id }), 2);
    assert.equal(await ReviewRequest.countDocuments({ bookingId: booking._id, status: "PENDING" }), 0);

    const samePerson = await seedBooking({ userId: hostId, hostId });
    await assert.rejects(() => submitBookingReview({ userId: String(hostId), bookingId: String(samePerson._id), rating: 5 }), (err: unknown) => err instanceof ApiError && err.status === 409);
  });

  it("allows three skips, then blocks booking and arrival until the review is submitted", async () => {
    assert.equal(reviewSkipLimit(), 3);
    const booking = await seedBooking();
    await ensureReviewRequests([String(booking._id)]);
    const driverRequest = await ReviewRequest.findOne({ bookingId: booking._id, authorRole: "DRIVER" });
    for (let i = 0; i < 3; i += 1) await skipReviewRequest(String(driverId), String(driverRequest!._id));
    assert.equal((await User.findById(driverId))?.reviewSkipCount, 3);
    assert.equal((await ReviewRequest.findById(driverRequest!._id))?.status, "PENDING");
    await assert.rejects(() => skipReviewRequest(String(driverId), String(driverRequest!._id)), (err: unknown) => err instanceof ApiError && err.status === 409);

    const blocked = createBooking({
      userId: String(driverId),
      spaceId: String(new mongoose.Types.ObjectId()),
      start: new Date(Date.now() + 86400000),
      durationMins: 60,
      vehicleType: "CAR",
    });
    await assert.rejects(() => blocked, (err: unknown) => err instanceof ApiError && err.status === 409 && /pending review/i.test(err.message));

    const arrival = await seedBooking({ status: "CONFIRMED", end: new Date(Date.now() + 3600000), accessCode: "111111" });
    await recordVehicleCheck({ hostId: String(hostId), bookingId: String(arrival._id), decision: "MATCH" });
    await User.updateOne({ _id: hostId }, { $set: { reviewSkipCount: 3 } });
    await assert.rejects(() => verifyArrivalCode(String(hostId), String(arrival._id), "111111"), (err: unknown) => err instanceof ApiError && err.status === 409);

    await submitBookingReview({ userId: String(driverId), bookingId: String(booking._id), rating: 4 });
    await assert.rejects(
      () => createBooking({
        userId: String(driverId),
        spaceId: String(new mongoose.Types.ObjectId()),
        start: new Date(Date.now() + 86400000),
        durationMins: 60,
        vehicleType: "CAR",
      }),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
    await submitBookingReview({ userId: String(hostId), bookingId: String(booking._id), rating: 4 });
    const checked = await verifyArrivalCode(String(hostId), String(arrival._id), "111111");
    assert.equal(checked.verified, true);
    assert.equal((await Booking.findById(arrival._id))?.status, "CONFIRMED");
    const allowance = await assertCanTransact(String(driverId));
    assert.equal(allowance, undefined);
  });

  it("requires a current vehicle acknowledgement before the access code, and audits an explicit override", async () => {
    const booking = await seedBooking({ status: "CONFIRMED", end: new Date(Date.now() + 2 * 3600000), accessCode: "222333" });
    await assert.rejects(() => verifyArrivalCode(String(hostId), String(booking._id), "222333"), (err: unknown) => err instanceof ApiError && err.status === 409);
    await assert.rejects(() => verifyArrivalCode("", String(booking._id), "222333"), (err: unknown) => err instanceof ApiError && err.status === 401);
    await assert.rejects(() => recordVehicleCheck({ hostId: String(strangerId), bookingId: String(booking._id), decision: "MATCH" }), (err: unknown) => err instanceof ApiError && err.status === 404);

    await recordVehicleCheck({ hostId: String(hostId), bookingId: String(booking._id), decision: "MISMATCH_DECLINED" });
    await assert.rejects(() => verifyArrivalCode(String(hostId), String(booking._id), "222333"), (err: unknown) => err instanceof ApiError && err.status === 409);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");

    await assert.rejects(
      () => recordVehicleCheck({ hostId: String(hostId), bookingId: String(booking._id), decision: "MISMATCH_OVERRIDE", acknowledgement: "ok" }),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    await recordVehicleCheck({ hostId: String(hostId), bookingId: String(booking._id), decision: "MISMATCH_OVERRIDE", acknowledgement: "I ACCEPT THE RISK" });
    await recordVehicleCheck({ hostId: String(hostId), bookingId: String(booking._id), decision: "MISMATCH_OVERRIDE", acknowledgement: "I ACCEPT THE RISK" });
    assert.equal(await AdminAudit.countDocuments({ action: "VEHICLE_MISMATCH_OVERRIDE", bookingId: booking._id }), 1);
    assert.equal(await VehicleCheck.countDocuments({ bookingId: booking._id, decision: "MISMATCH_OVERRIDE" }), 1);
    const notice = await Notification.findOne({ userId: driverId, type: "VEHICLE_MISMATCH" });
    assert.ok(notice);
    assert.equal(JSON.stringify(notice).includes("222333"), false);

    await Booking.updateOne({ _id: booking._id }, { $set: { vehiclePlate: "MH12CD9999" } });
    await assert.rejects(() => verifyArrivalCode(String(hostId), String(booking._id), "222333"), (err: unknown) => err instanceof ApiError && err.status === 409);

    await recordVehicleCheck({ hostId: String(hostId), bookingId: String(booking._id), decision: "MATCH" });
    await assert.rejects(() => verifyArrivalCode(String(hostId), String(booking._id), "000000"), (err: unknown) => err instanceof ApiError && err.status === 400);
    const result = await verifyArrivalCode(String(hostId), String(booking._id), "222333");
    assert.equal(result.verified, true);
    assert.equal((await Booking.findById(booking._id))?.status, "CONFIRMED");
  });

  it("lets someone else report a review once", async () => {
    const booking = await seedBooking();
    const review = await submitBookingReview({ userId: String(driverId), bookingId: String(booking._id), rating: 1, comment: "abuse" });
    await assert.rejects(() => reportReview(String(driverId), String(review._id), "ABUSIVE", ""), (err: unknown) => err instanceof ApiError && err.status === 409);
    await reportReview(String(hostId), String(review._id), "ABUSIVE", "<b>shouting</b>");
    await assert.rejects(() => reportReview(String(hostId), String(review._id), "SPAM", ""), (err: unknown) => err instanceof ApiError && err.status === 409);
  });
});
