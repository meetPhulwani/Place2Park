import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Request, Response } from "express";
import { Booking, ParkingSpace, Payment, PendingUpload } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { detail, quote } from "../controllers/parking.controller.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { clampSearchRadiusKm, searchSpaces } from "./search.js";
import { runHoldMaintenance } from "./maintenance.js";
import { sweepUnattachedUploads } from "./media.js";
import { captureMatchesStored } from "./payments.js";

let memory: MongoMemoryServer;

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

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-security-remediation"));
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

describe("public search stays off the payment provider", () => {
  it("clamps the search radius to 12 km", () => {
    assert.equal(clampSearchRadiusKm(undefined), 8);
    assert.equal(clampSearchRadiusKm(12), 12);
    assert.equal(clampSearchRadiusKm(500), 12);
  });

  it("does not cancel Razorpay orders while searching", async () => {
    const hostId = new mongoose.Types.ObjectId();
    const space = await ParkingSpace.create({
      hostId,
      title: "Search side-effect space",
      address: "Hidden",
      area: "Kalyan",
      city: "Mumbai",
      location: { type: "Point", coordinates: [73.13, 19.24] },
      pricePerHour: 4000,
      status: "VERIFIED",
    });
    const start = new Date(Date.now() + 3 * 3600_000);
    const booking = await Booking.create({
      code: "PK-SEARCH1",
      userId: new mongoose.Types.ObjectId(),
      spaceId: space._id,
      hostId,
      start,
      end: new Date(start.getTime() + 3600_000),
      durationMins: 60,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60_000),
      vehicleType: "CAR",
      accessCode: "111111",
      baseAmount: 4000,
      serviceFee: 200,
      totalAmount: 4200,
      platformFee: 600,
      hostEarning: 3400,
    });
    await Payment.create({
      bookingId: booking._id,
      provider: "RAZORPAY",
      orderId: "order_search_side_effect",
      amount: 4200,
      currency: "INR",
      status: "CREATED",
    });

    await searchSpaces({ lat: 19.24, lng: 73.13, maxDistanceKm: 500 });
    const untouched = await Payment.findOne({ bookingId: booking._id });
    assert.equal(untouched?.orderCancelStatus ?? null, null);
    assert.equal(untouched?.status, "CREATED");

    let calls = 0;
    await runHoldMaintenance({
      cancelOrder: async () => {
        calls += 1;
        return "cancelled";
      },
    });
    assert.equal(calls, 1);
    assert.equal((await Payment.findOne({ bookingId: booking._id }))?.orderCancelStatus, "cancelled");
    assert.equal((await Booking.findById(booking._id))?.status, "EXPIRED");
  });
});

describe("paused listings", () => {
  it("returns 404 to anonymous readers and the listing to its host", async () => {
    const hostId = new mongoose.Types.ObjectId();
    const space = await ParkingSpace.create({
      hostId,
      title: "Paused driveway",
      address: "Host only",
      area: "Shahad",
      city: "Mumbai",
      location: { type: "Point", coordinates: [73.16, 19.25] },
      pricePerHour: 3000,
      status: "PAUSED",
    });
    const id = String(space._id);
    await assert.rejects(
      () => detail({ params: { id } } as unknown as Request, jsonRes()),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
    const start = new Date(Date.now() + 2 * 3600_000).toISOString();
    await assert.rejects(
      () => quote({ params: { id }, query: { start, durationMins: "60" } } as unknown as Request, jsonRes()),
      (err: unknown) => err instanceof ApiError && err.status === 404
    );
    const res = jsonRes();
    await detail({ params: { id }, userId: String(hostId), userRole: "HOST" } as unknown as AuthedRequest, res);
    assert.equal(res.statusCode, 200);
    const body = res.body as { data?: { space?: { status?: string } } };
    assert.equal(body.data?.space?.status, "PAUSED");
    const adminRes = jsonRes();
    await detail(
      { params: { id }, userId: new mongoose.Types.ObjectId().toString(), userRole: "ADMIN" } as unknown as AuthedRequest,
      adminRes
    );
    assert.equal(adminRes.statusCode, 200);
  });
});

describe("unattached upload retention", () => {
  it("deletes an old unattached photo and keeps one a listing still uses", async () => {
    const hostId = new mongoose.Types.ObjectId();
    const orphanId = "place2park/listings/host/orphan";
    const keptId = "place2park/listings/host/kept";
    const old = new Date(Date.now() - 48 * 3600_000);
    const orphan = await PendingUpload.create({ hostId, url: "https://res.cloudinary.com/demo/orphan.jpg", publicId: orphanId });
    const kept = await PendingUpload.create({ hostId, url: "https://res.cloudinary.com/demo/kept.jpg", publicId: keptId });
    await PendingUpload.collection.updateMany({ _id: { $in: [orphan._id, kept._id] } }, { $set: { createdAt: old } });
    await ParkingSpace.create({
      hostId,
      title: "Photo kept space",
      address: "Hidden",
      area: "Dadar",
      city: "Mumbai",
      location: { type: "Point", coordinates: [72.84, 19.02] },
      pricePerHour: 5000,
      status: "VERIFIED",
      images: [{ url: "https://res.cloudinary.com/demo/kept.jpg", publicId: keptId }],
    });
    const destroyed: string[] = [];
    await sweepUnattachedUploads({
      destroy: async (publicId) => {
        destroyed.push(publicId);
      },
      retentionMs: 24 * 3600_000,
    });
    assert.deepEqual(destroyed, [orphanId]);
    assert.equal(await PendingUpload.countDocuments({ publicId: orphanId }), 0);
    assert.equal((await PendingUpload.findOne({ publicId: keptId }))?.attached, true);
  });
});

describe("captured payment amount", () => {
  it("accepts only the stored paise amount and currency", () => {
    assert.equal(captureMatchesStored({ amount: 7350, currency: "INR" }, { amount: 7350, currency: "inr" }), true);
    assert.equal(captureMatchesStored({ amount: 7350, currency: "INR" }, { amount: 100, currency: "INR" }), false);
    assert.equal(captureMatchesStored({ amount: 7350, currency: "INR" }, { amount: 7350, currency: "USD" }), false);
    assert.equal(captureMatchesStored({ amount: 7350, currency: "INR" }, { currency: "INR" }), false);
  });
});
