import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { env } from "../config/env.js";
import { authenticate, signToken } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import {
  AdminAudit,
  Booking,
  Favorite,
  HostPayout,
  Notification,
  ParkingSpace,
  Payment,
  Review,
  SupportTicket,
  User,
  Vehicle,
} from "../models/index.js";
import { deleteAccountSchema } from "../utils/validation.js";
import { deleteOwnAccount } from "./account-deletion.js";

const prevJwt = env.JWT_SECRET;
let memory: MongoMemoryServer;
const password = "Correct1!horse";
let passwordHash = "";
let driverId = "";
let hostId = "";
let otherId = "";
let spaceId: mongoose.Types.ObjectId;

async function notices() {
  const sent: string[] = [];
  return {
    sent,
    sendNotice: async (to: string) => {
      sent.push(to);
    },
  };
}

before(async () => {
  env.JWT_SECRET = prevJwt || "account-delete-test-secret-long-enough";
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-account-delete"));
  passwordHash = await bcrypt.hash(password, 4);
  const hash = passwordHash;
  const [driver, host, other] = await User.create([
    { name: "Aarav Mehta", email: "driver-delete@parkly.test", role: "DRIVER", passwordHash: hash, phone: "9876543210" },
    { name: "Host Person", email: "host-delete@parkly.test", role: "HOST", passwordHash: hash },
    { name: "Other Person", email: "other-delete@parkly.test", role: "DRIVER", passwordHash: hash, phone: "9000000000" },
  ]);
  driverId = String(driver._id);
  hostId = String(host._id);
  otherId = String(other._id);
  const space = await ParkingSpace.create({
    hostId,
    title: "Home driveway",
    address: "12 Private Lane",
    formattedAddress: "12 Private Lane, Mumbai",
    accessInstructions: "Ring the bell",
    area: "Bandra",
    city: "Mumbai",
    location: { type: "Point", coordinates: [72.83, 19.05] },
    pricePerHour: 3500,
    status: "VERIFIED",
    images: [{ url: "https://example.test/private.jpg", publicId: "private" }],
  });
  spaceId = space._id as mongoose.Types.ObjectId;
});

after(async () => {
  env.JWT_SECRET = prevJwt;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await Promise.all([
    Booking.deleteMany({}),
    Payment.deleteMany({}),
    HostPayout.deleteMany({}),
    AdminAudit.deleteMany({}),
    Review.deleteMany({}),
    Favorite.deleteMany({}),
    Notification.deleteMany({}),
    Vehicle.deleteMany({}),
    SupportTicket.deleteMany({}),
  ]);
  await User.updateOne(
    { _id: driverId },
    {
      $set: {
        name: "Aarav Mehta",
        email: "driver-delete@parkly.test",
        phone: "9876543210",
        status: "ACTIVE",
        role: "DRIVER",
        tokenVersion: 0,
        passwordHash,
      },
      $unset: { deletedAt: 1, googleId: 1 },
    }
  );
  await User.updateOne({ _id: hostId }, { $set: { status: "ACTIVE", email: "host-delete@parkly.test", name: "Host Person", tokenVersion: 0 } });
});

function booking(overrides: Record<string, unknown> = {}) {
  const start = new Date("2026-01-01T10:00:00Z");
  return Booking.create({
    code: `B${Math.random().toString(16).slice(2, 10)}`,
    userId: driverId,
    hostId,
    spaceId,
    start,
    end: new Date(start.getTime() + 60 * 60_000),
    durationMins: 60,
    status: "COMPLETED",
    vehiclePlate: "MH01AB1234",
    accessCode: "DOOR-99",
    baseAmount: 3500,
    serviceFee: 175,
    totalAmount: 3675,
    platformFee: 350,
    hostEarning: 3150,
    ...overrides,
  });
}

describe("account deletion", () => {
  it("deletes after the password matches and keeps financial records", async () => {
    const row = await booking();
    await Payment.create({ bookingId: row._id, amount: row.totalAmount, status: "PAID", provider: "MOCK" });
    const payout = await HostPayout.create({
      hostId,
      bookingIds: [row._id],
      amount: row.hostEarning,
      status: "PAID",
      method: "MANUAL",
      idempotencyKey: "paid-delete-1",
    });
    await Booking.updateOne({ _id: row._id }, { payoutId: payout._id });
    await Vehicle.create({ userId: driverId, type: "CAR", plate: "MH01AB1234" });
    await Favorite.create({ userId: driverId, spaceId });
    await Notification.create({ userId: driverId, type: "BOOKING", title: "Booked", body: "private note" });
    await Review.create({ bookingId: row._id, spaceId, userId: driverId, rating: 5, comment: "My home review" });
    const mail = await notices();
    const token = signToken(driverId, 0);

    const result = await deleteOwnAccount(driverId, { confirmation: "CONFIRM", password }, mail);
    assert.equal(result.deleted, true);
    assert.equal(mail.sent.length, 1);

    const user = await User.findById(driverId).select("+passwordHash +googleId");
    assert.equal(user?.status, "DELETED");
    assert.equal(user?.name, "Deleted user");
    assert.equal(user?.phone, "");
    assert.equal(user?.passwordHash, undefined);
    assert.equal(user?.tokenVersion, 1);
    assert.match(String(user?.email), /^deleted\./);

    const kept = await Booking.findById(row._id);
    assert.equal(kept?.totalAmount, 3675);
    assert.equal(kept?.hostEarning, 3150);
    assert.equal(kept?.vehiclePlate, "");
    assert.equal(await Payment.countDocuments({ bookingId: row._id }), 1);
    assert.equal((await HostPayout.findById(payout._id))?.amount, row.hostEarning);
    assert.equal(await Vehicle.countDocuments({ userId: driverId }), 0);
    assert.equal(await Favorite.countDocuments({ userId: driverId }), 0);
    assert.equal(await Notification.countDocuments({ userId: driverId }), 0);
    assert.equal((await Review.findOne({ userId: driverId }))?.comment, "");
    assert.equal((await Review.findOne({ userId: driverId }))?.rating, 5);

    const other = await User.findById(otherId);
    assert.equal(other?.email, "other-delete@parkly.test");
    assert.equal(other?.phone, "9000000000");

    const audit = await AdminAudit.findOne({ action: "ACCOUNT_DELETED", actorId: driverId }).lean();
    assert.ok(audit);
    assert.equal(JSON.stringify(audit).includes(password), false);
    assert.equal(JSON.stringify(audit).includes("driver-delete@parkly.test"), false);

    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          void authenticate(
            { headers: { authorization: `Bearer ${token}` } } as never,
            {} as never,
            (err?: unknown) => (err ? reject(err) : resolve(undefined))
          );
        }),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
  });

  it("rejects deletion when the request has no authentication token", async () => {
    await new Promise<void>((resolve, reject) => {
      authenticate({ headers: {} } as never, {} as never, (err) => {
        try {
          assert.ok(err instanceof ApiError && err.status === 401);
          assert.equal(err.message, "Please log in to continue.");
          resolve();
        } catch (error) {
          reject(error);
        }
      });
    });
    assert.equal((await User.findById(driverId))?.status, "ACTIVE");
  });

  it("deletes the authenticated account and leaves another account in place", async () => {
    const mail = await notices();
    const result = await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(result.deleted, true);
    assert.equal((await User.findById(driverId))?.status, "DELETED");
    assert.equal((await User.findById(otherId))?.email, "other-delete@parkly.test");
    assert.equal((await User.findById(otherId))?.status, "ACTIVE");
  });

  it("refuses deletion while a support case is open, including a second request", async () => {
    await SupportTicket.create({
      reference: `SUP-${Date.now()}`,
      userId: driverId,
      category: "ACCOUNT",
      subject: "Open case",
      description: "This case is still open.",
      status: "OPEN",
    });
    const mail = await notices();
    const expected = "A support case or report is still open. Resolve it before deleting your account.";
    await assert.rejects(
      () => deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail),
      (err: unknown) => err instanceof ApiError && err.status === 409 && err.message === expected
    );
    await assert.rejects(
      () => deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail),
      (err: unknown) => err instanceof ApiError && err.status === 409 && err.message === expected
    );
    assert.equal(mail.sent.length, 0);
    assert.equal((await User.findById(driverId))?.status, "ACTIVE");
    assert.equal((await User.findById(driverId))?.email, "driver-delete@parkly.test");
  });

  it("deletes without asking for the account password", async () => {
    const mail = await notices();
    await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal((await User.findById(driverId))?.status, "DELETED");
    assert.equal(mail.sent.length, 1);
  });

  it("accepts a matching Google confirmation and rejects a different Google account", async () => {
    await User.updateOne({ _id: driverId }, { $set: { googleId: "google-sub-1" }, $unset: { passwordHash: 1 } });
    await assert.rejects(
      () =>
        deleteOwnAccount(
          driverId,
          { confirmation: "CONFIRM", credential: "other" },
          { verifyGoogleSub: async () => "someone-else", sendNotice: async () => undefined }
        ),
      (err: unknown) => err instanceof ApiError && err.status === 401
    );
    assert.equal((await User.findById(driverId))?.status, "ACTIVE");
    const mail = await notices();
    await deleteOwnAccount(
      driverId,
      { confirmation: "CONFIRM", credential: "test-credential" },
      { ...mail, verifyGoogleSub: async () => "google-sub-1" }
    );
    assert.equal((await User.findById(driverId))?.status, "DELETED");
    assert.equal(mail.sent.length, 1);
  });

  it("blocks deletion while a booking is active", async () => {
    await booking({ status: "CONFIRMED" });
    await assert.rejects(
      () => deleteOwnAccount(driverId, { confirmation: "CONFIRM", password }),
      (err: unknown) => err instanceof ApiError && err.status === 409 && /active booking/i.test(err.message)
    );
    assert.equal((await User.findById(driverId))?.email, "driver-delete@parkly.test");
  });

  it("blocks deletion while host earnings or a payout are still open", async () => {
    const row = await booking();
    await Payment.create({ bookingId: row._id, amount: row.totalAmount, status: "PAID", provider: "MOCK" });
    await assert.rejects(
      () => deleteOwnAccount(hostId, { confirmation: "CONFIRM", password }),
      (err: unknown) => err instanceof ApiError && err.status === 409 && /unpaid/i.test(err.message)
    );
    await HostPayout.create({
      hostId,
      bookingIds: [row._id],
      amount: row.hostEarning,
      status: "PROCESSING",
      method: "MANUAL",
      idempotencyKey: "open-delete-1",
    });
    await assert.rejects(
      () => deleteOwnAccount(hostId, { confirmation: "CONFIRM", password }),
      (err: unknown) => err instanceof ApiError && err.status === 409 && /payout/i.test(err.message)
    );
    assert.equal((await User.findById(hostId))?.status, "ACTIVE");
  });

  it("does not delete an admin or another person's records", async () => {
    await User.updateOne({ _id: driverId }, { role: "ADMIN" });
    await assert.rejects(
      () => deleteOwnAccount(driverId, { confirmation: "CONFIRM", password }),
      (err: unknown) => err instanceof ApiError && err.status === 403
    );
    const parsed = deleteAccountSchema.safeParse({
      confirmation: "CONFIRM",
      password,
      userId: otherId,
    });
    assert.equal(parsed.success, false);
    assert.equal((await User.findById(otherId))?.name, "Other Person");
  });

  it("treats a repeated deletion as already complete", async () => {
    const mail = await notices();
    await deleteOwnAccount(driverId, { confirmation: "CONFIRM", password }, mail);
    const again = await deleteOwnAccount(driverId, { confirmation: "CONFIRM", password }, mail);
    assert.equal(again.already, true);
    assert.equal(mail.sent.length, 1);
    assert.equal(await AdminAudit.countDocuments({ action: "ACCOUNT_DELETED", actorId: driverId }), 1);
    const space = await ParkingSpace.findById(hostId && spaceId);
    assert.equal(space?.status, "VERIFIED");
  });

  it("hides a host listing and keeps the listing document", async () => {
    const mail = await notices();
    await deleteOwnAccount(hostId, { confirmation: "CONFIRM", password }, mail);
    const space = await ParkingSpace.findById(spaceId);
    assert.ok(space);
    assert.equal(space?.status, "HIDDEN");
    assert.equal(space?.address, "Removed");
    assert.equal(space?.accessInstructions, "");
    assert.equal(space?.images.length, 0);
  });
});
