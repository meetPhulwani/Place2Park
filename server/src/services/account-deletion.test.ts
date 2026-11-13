import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { env } from "../config/env.js";
import { login } from "../controllers/auth.controller.js";
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
  PendingUpload,
  Report,
  Review,
  SupportTicket,
  TicketMessage,
  User,
  UserReport,
  Vehicle,
} from "../models/index.js";
import { deleteAccountSchema } from "../utils/validation.js";
import { deleteOwnAccount } from "./account-deletion.js";

const prevJwt = env.JWT_SECRET;
let memory: MongoMemoryReplSet;
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

function attemptAuth(token: string, method = "GET", url = "/api/users/me") {
  return new Promise<void>((resolve, reject) => {
    void authenticate(
      { method, url, originalUrl: url, headers: { authorization: `Bearer ${token}` } } as never,
      {} as never,
      (err?: unknown) => (err ? reject(err) : resolve())
    );
  });
}

async function attemptLogin(email: string, secret: string) {
  try {
    await login({ body: { email, password: secret } } as never, { json() { return this; } } as never);
    return 200;
  } catch (err) {
    return err instanceof ApiError ? err.status : 0;
  }
}

before(async () => {
  env.JWT_SECRET = prevJwt || "account-delete-test-secret-long-enough";
  memory = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
    instanceOpts: [{ launchTimeout: 120000 }],
  });
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
    UserReport.deleteMany({}),
    Report.deleteMany({}),
    TicketMessage.deleteMany({}),
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
        image: "",
      },
      $unset: { deletedAt: 1, deletionRequestedAt: 1, googleId: 1 },
    },
    { upsert: true }
  );
  await User.updateOne(
    { _id: hostId },
    {
      $set: {
        name: "Host Person",
        email: "host-delete@parkly.test",
        phone: "",
        role: "HOST",
        status: "ACTIVE",
        tokenVersion: 0,
        passwordHash,
        image: "",
      },
      $unset: { deletedAt: 1, deletionRequestedAt: 1, googleId: 1 },
    },
    { upsert: true }
  );
  await ParkingSpace.updateOne(
    { _id: spaceId },
    {
      $set: {
        status: "VERIFIED",
        title: "Home driveway",
        description: "",
        address: "12 Private Lane",
        formattedAddress: "12 Private Lane, Mumbai",
        accessInstructions: "Ring the bell",
        images: [{ url: "https://example.test/private.jpg", publicId: "private" }],
      },
    }
  );
  await PendingUpload.deleteMany({});
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

    assert.equal(await User.findById(driverId), null);
    assert.equal(await User.findOne({ email: "driver-delete@parkly.test" }), null);
    assert.equal(await attemptLogin("driver-delete@parkly.test", password), 401);

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
      (err: unknown) => err instanceof ApiError && err.status === 401 && err.message === "Account not found."
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
    assert.equal(await User.findById(driverId), null);
    assert.equal((await User.findById(otherId))?.email, "other-delete@parkly.test");
    assert.equal((await User.findById(otherId))?.status, "ACTIVE");
  });

  it("deletes an account that still has ordinary support tickets, bug reports, and complaints", async () => {
    const row = await booking();
    await Payment.create({ bookingId: row._id, amount: row.totalAmount, status: "PAID", provider: "MOCK" });
    const ticket = await SupportTicket.create({
      reference: `SUP-${Date.now()}`,
      userId: driverId,
      category: "ACCOUNT",
      subject: "Need help with my name",
      description: "Please call me on 9876543210.",
      status: "OPEN",
      evidence: [{ url: "https://example.test/ticket.jpg", publicId: "ticket" }],
    });
    const bug = await SupportTicket.create({
      reference: `BUG-${Date.now()}`,
      userId: driverId,
      category: "BUG",
      subject: "Map pin is wrong",
      description: "The pin is on the wrong street near my house.",
      status: "OPEN",
    });
    const complaint = await UserReport.create({
      reference: `UR-${Date.now()}`,
      reporterId: driverId,
      reportedUserId: hostId,
      bookingId: row._id,
      direction: "DRIVER_REPORTS_HOST",
      category: "OTHER",
      description: "The host was rude. My phone is 9876543210.",
      status: "OPEN",
      evidence: [{ url: "https://example.test/report.jpg", publicId: "report" }],
    });
    const againstDriver = await UserReport.create({
      reference: `UR-host-${Date.now()}`,
      reporterId: hostId,
      reportedUserId: driverId,
      bookingId: row._id,
      direction: "HOST_REPORTS_DRIVER",
      category: "DRIVER_NO_SHOW",
      description: "The driver did not arrive.",
      status: "UNDER_REVIEW",
    });
    const listingReport = await Report.create({
      spaceId,
      reporterId: driverId,
      reason: "OTHER",
      details: "This listing is noisy.",
      status: "OPEN",
    });
    await TicketMessage.create({
      ticketKind: "SUPPORT",
      ticketId: ticket._id,
      authorId: driverId,
      body: "My email is driver-delete@parkly.test.",
    });
    const mail = await notices();
    const result = await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(result.deleted, true);
    assert.equal(await User.findById(driverId), null);
    assert.equal((await Payment.findOne({ bookingId: row._id }))?.amount, row.totalAmount);
    assert.equal((await Booking.findById(row._id))?.totalAmount, 3675);

    const keptTicket = await SupportTicket.findById(ticket._id);
    assert.equal(String(keptTicket?.userId), driverId);
    assert.equal(keptTicket?.status, "OPEN");
    assert.equal(keptTicket?.subject, "Removed");
    assert.equal(keptTicket?.description, "Removed.");
    assert.equal(keptTicket?.evidence.length, 0);
    const keptBug = await SupportTicket.findById(bug._id);
    assert.equal(keptBug?.category, "BUG");
    assert.equal(keptBug?.subject, "Removed");
    assert.equal(JSON.stringify(keptBug).includes("9876543210"), false);

    const keptComplaint = await UserReport.findById(complaint._id);
    assert.equal(String(keptComplaint?.reporterId), driverId);
    assert.equal(String(keptComplaint?.reportedUserId), hostId);
    assert.equal(keptComplaint?.description, "Removed.");
    assert.equal(keptComplaint?.evidence.length, 0);
    const keptAgainst = await UserReport.findById(againstDriver._id);
    assert.equal(keptAgainst?.description, "The driver did not arrive.");
    assert.equal(String(keptAgainst?.reportedUserId), driverId);

    const keptListing = await Report.findById(listingReport._id);
    assert.equal(String(keptListing?.reporterId), driverId);
    assert.equal(keptListing?.status, "OPEN");
    assert.equal(keptListing?.details, "");
    const message = await TicketMessage.findOne({ ticketId: ticket._id, authorId: driverId });
    assert.equal(message?.body, "Removed.");
    assert.equal(JSON.stringify(message).includes("driver-delete@parkly.test"), false);
    assert.equal((await User.findById(hostId))?.email, "host-delete@parkly.test");
  });

  it("blocks deletion while a refund is still pending and keeps the payment", async () => {
    const row = await booking();
    await Payment.create({ bookingId: row._id, amount: row.totalAmount, status: "PAID", provider: "MOCK", refundStatus: "PENDING" });
    const mail = await notices();
    await assert.rejects(
      () => deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 409 &&
        err.message === "A refund is still in progress. Wait until it finishes before deleting your account."
    );
    assert.equal((await User.findById(driverId))?.status, "ACTIVE");
    assert.equal((await Payment.findOne({ bookingId: row._id }))?.refundStatus, "PENDING");
    assert.equal(mail.sent.length, 0);
  });

  it("deletes without asking for the account password", async () => {
    const mail = await notices();
    await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(await User.findById(driverId), null);
    assert.equal(mail.sent.length, 1);
  });

  it("deletes a Google-only account without a Google or password confirmation", async () => {
    await User.updateOne({ _id: driverId }, { $set: { googleId: "google-sub-1" }, $unset: { passwordHash: 1 } });
    const mail = await notices();
    await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(await User.findById(driverId), null);
    assert.equal(await User.findOne({ googleId: "google-sub-1" }), null);
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
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 409 &&
        /earnings are still unpaid/i.test(err.message) &&
        /payout is still processing/i.test(err.message) &&
        !/support case/i.test(err.message)
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
    assert.equal(await User.findById(driverId), null);
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
    assert.equal(await User.findById(hostId), null);
  });

  it("destroys only this user's Cloudinary photos and local uploads", async () => {
    const owned = `place2park/listings/${hostId}/photo`;
    const foreign = `place2park/listings/${otherId}/secret`;
    await User.updateOne(
      { _id: hostId },
      { $set: { image: `https://res.cloudinary.com/demo/image/upload/v1/${owned}.jpg` } }
    );
    await ParkingSpace.updateOne(
      { _id: spaceId },
      {
        $set: {
          images: [
            { url: `https://res.cloudinary.com/demo/image/upload/v1/${owned}.jpg`, publicId: owned },
            { url: "https://example.test/private.jpg", publicId: "private" },
          ],
        },
      }
    );
    await PendingUpload.create({ hostId, url: "/uploads/abcdef0123456789.jpg", publicId: "" });
    await PendingUpload.create({ hostId: otherId, url: `https://res.cloudinary.com/demo/image/upload/v1/${foreign}.jpg`, publicId: foreign });
    const destroyed: string[] = [];
    const mail = await notices();
    await deleteOwnAccount(hostId, { confirmation: "CONFIRM" }, {
      ...mail,
      destroyImage: async (publicId) => {
        destroyed.push(publicId);
      },
    });
    assert.deepEqual(destroyed, [owned]);
    assert.equal(await PendingUpload.countDocuments({ hostId }), 0);
    assert.equal(await PendingUpload.countDocuments({ publicId: foreign }), 1);
    assert.equal((await ParkingSpace.findById(spaceId))?.images.length, 0);
  });

  it("finishes a deletion that stopped after the account was locked", async () => {
    await Vehicle.create({ userId: driverId, type: "CAR", plate: "MH01AB1234" });
    const token = signToken(driverId, 0);
    const mail = await notices();
    let failed = false;
    await assert.rejects(
      () =>
        deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, {
          ...mail,
          beforeRemove: () => {
            if (!failed) {
              failed = true;
              throw new Error("storage interrupted");
            }
          },
        }),
      (err: unknown) => err instanceof Error && err.message === "storage interrupted"
    );

    const pending = await User.findById(driverId).select("status tokenVersion email");
    assert.equal(pending?.status, "DELETION_PENDING");
    assert.equal(pending?.tokenVersion, 1);
    assert.equal(pending?.email, "driver-delete@parkly.test");
    assert.equal(await Vehicle.countDocuments({ userId: driverId }), 1);
    assert.equal(await attemptLogin("driver-delete@parkly.test", password), 401);
    await assert.rejects(
      () => attemptAuth(token),
      (err: unknown) => err instanceof ApiError && err.status === 401 && err.message === "Your session has expired. Please log in again."
    );
    await attemptAuth(token, "POST", "/api/account/delete");

    const result = await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(result.deleted, true);
    assert.equal(result.already, false);
    assert.equal(await User.findById(driverId), null);
    assert.equal(await Vehicle.countDocuments({ userId: driverId }), 0);
    assert.equal(await attemptLogin("driver-delete@parkly.test", password), 401);
    await assert.rejects(
      () => attemptAuth(token, "POST", "/api/account/delete"),
      (err: unknown) => err instanceof ApiError && err.status === 401 && err.message === "Account not found."
    );

    const again = await deleteOwnAccount(driverId, { confirmation: "CONFIRM" }, mail);
    assert.equal(again.already, true);
    assert.equal(mail.sent.length, 1);
    assert.equal(await AdminAudit.countDocuments({ action: "ACCOUNT_DELETED", actorId: driverId }), 1);
  });
});
