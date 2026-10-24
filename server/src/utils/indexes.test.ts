import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Booking, Favorite, HostPayout, Payment, User } from "../models/index.js";
import {
  REQUIRED_UNIQUE_INDEXES,
  applyUniqueIndexes,
  inspectUniqueIndexes,
} from "./indexes.js";

let memory: MongoMemoryServer;

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-index-test"));
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Booking.deleteMany({});
  await Payment.deleteMany({});
  await HostPayout.deleteMany({});
  await Favorite.deleteMany({});
});

describe("required unique indexes", () => {
  it("includes the money-critical unique keys without drop instructions", () => {
    const keys = REQUIRED_UNIQUE_INDEXES.map((idx) => `${idx.collection}:${idx.fields.join(",")}`);
    assert.ok(keys.includes("users:email"));
    assert.ok(keys.includes("bookings:code"));
    assert.ok(keys.includes("payments:bookingId"));
    assert.ok(keys.includes("hostpayouts:idempotencyKey"));
    assert.ok(keys.includes("favorites:userId,spaceId"));
    assert.equal(REQUIRED_UNIQUE_INDEXES.every((idx) => idx.unique && !idx.drop), true);
  });

  it("reports duplicate documents that must be reconciled before a unique index can be created", async () => {
    const users = mongoose.connection.db!.collection("users");
    await users.dropIndexes().catch(() => undefined);
    await users.insertMany([
      { name: "A", email: "dup@parkly.test", role: "DRIVER" },
      { name: "B", email: "dup@parkly.test", role: "DRIVER" },
    ]);
    const report = await inspectUniqueIndexes(mongoose.connection);
    const email = report.find((row) => row.collection === "users" && row.fields.join(",") === "email");
    assert.ok(email);
    assert.equal(email?.duplicateCount, 1);
    assert.ok((email?.duplicateKeys.length ?? 0) >= 1);
    assert.match(email?.reconcile ?? "", /reconcile|duplicate/i);
  });

  it("refuses to create a unique index while duplicates exist and never drops indexes", async () => {
    const users = mongoose.connection.db!.collection("users");
    await users.dropIndexes().catch(() => undefined);
    await users.insertMany([
      { name: "A", email: "dup2@parkly.test", role: "DRIVER" },
      { name: "B", email: "dup2@parkly.test", role: "DRIVER" },
    ]);
    const before = await mongoose.connection.db!.collection("users").indexes();
    const result = await applyUniqueIndexes(mongoose.connection, { apply: true });
    const email = result.find((row) => row.collection === "users" && row.fields.join(",") === "email");
    assert.equal(email?.created, false);
    assert.equal(email?.skippedReason, "duplicates");
    assert.equal(result.every((row) => row.dropped === false), true);
    const after = await mongoose.connection.db!.collection("users").indexes();
    assert.equal(
      after.some((idx) => idx.unique && JSON.stringify(idx.key) === JSON.stringify({ email: 1 })),
      false
    );
    assert.equal(
      after.filter((idx) => JSON.stringify(idx.key) === JSON.stringify({ email: 1 })).length,
      before.filter((idx) => JSON.stringify(idx.key) === JSON.stringify({ email: 1 })).length
    );
  });

  it("creates a missing unique index when the collection is clean", async () => {
    await mongoose.connection.db!.collection("users").dropIndexes().catch(() => undefined);
    await User.create({ name: "Only", email: "only@parkly.test", role: "DRIVER" });
    const result = await applyUniqueIndexes(mongoose.connection, { apply: true });
    const email = result.find((row) => row.collection === "users" && row.fields.join(",") === "email");
    assert.equal(email?.created || email?.alreadyExisted, true);
    assert.notEqual(email?.skippedReason, "duplicates");
    const indexes = await mongoose.connection.db!.collection("users").indexes();
    assert.ok(indexes.some((idx) => idx.unique && JSON.stringify(idx.key) === JSON.stringify({ email: 1 })));
  });

  it("counts missing and null unique fields as a blocker, not as a clean collection", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.dropIndexes().catch(() => undefined);
    await payouts.insertMany([
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 0 },
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 0, idempotencyKey: null },
    ]);
    const report = await inspectUniqueIndexes(mongoose.connection);
    const key = report.find((row) => row.collection === "hostpayouts" && row.fields.join(",") === "idempotencyKey");
    assert.ok(key);
    assert.equal(key?.duplicateCount, 0);
    assert.ok((key?.missingOrNullCount ?? 0) >= 2);
    assert.match(key?.reconcile ?? "", /missing|null/i);
  });

  it("counts empty-string unique fields as missing values and skips apply", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.dropIndexes().catch(() => undefined);
    await payouts.insertMany([
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 0, idempotencyKey: "" },
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 1, idempotencyKey: "manual:ok" },
    ]);
    const report = await inspectUniqueIndexes(mongoose.connection);
    const key = report.find((row) => row.collection === "hostpayouts" && row.fields.join(",") === "idempotencyKey");
    assert.ok((key?.missingOrNullCount ?? 0) >= 1);
    const result = await applyUniqueIndexes(mongoose.connection, { apply: true });
    const applied = result.find((row) => row.collection === "hostpayouts" && row.fields.join(",") === "idempotencyKey");
    assert.equal(applied?.created, false);
    assert.equal(applied?.skippedReason, "missing_values");
  });

  it("skips a same-key non-unique index and never drops or replaces it", async () => {
    const users = mongoose.connection.db!.collection("users");
    await users.dropIndexes().catch(() => undefined);
    await users.createIndex({ email: 1 }, { name: "email_1" });
    await users.insertOne({ name: "Only", email: "safe@parkly.test", role: "DRIVER" });
    const before = await users.indexes();
    const nonUnique = before.find((idx) => JSON.stringify(idx.key) === JSON.stringify({ email: 1 }));
    assert.equal(nonUnique?.unique, undefined);
    const result = await applyUniqueIndexes(mongoose.connection, { apply: true });
    const email = result.find((row) => row.collection === "users" && row.fields.join(",") === "email");
    assert.equal(email?.created, false);
    assert.equal(email?.existingNonUnique, true);
    assert.equal(email?.skippedReason, "non_unique_exists");
    assert.match(email?.reconcile ?? "", /non-unique|manually/i);
    const after = await users.indexes();
    assert.equal(after.length, before.length);
    assert.equal(
      after.some((idx) => idx.unique && JSON.stringify(idx.key) === JSON.stringify({ email: 1 })),
      false
    );
  });

  it("refuses to create a unique index while required fields are missing or null", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.dropIndexes().catch(() => undefined);
    await payouts.insertMany([
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 0 },
      { hostId: new mongoose.Types.ObjectId(), status: "PAID", amount: 0 },
    ]);
    const before = await payouts.indexes();
    const result = await applyUniqueIndexes(mongoose.connection, { apply: true });
    const key = result.find((row) => row.collection === "hostpayouts" && row.fields.join(",") === "idempotencyKey");
    assert.equal(key?.created, false);
    assert.equal(key?.skippedReason, "missing_values");
    const after = await payouts.indexes();
    assert.equal(
      after.some((idx) => idx.unique && JSON.stringify(idx.key) === JSON.stringify({ idempotencyKey: 1 })),
      false
    );
    assert.equal(after.length, before.length);
  });
});
