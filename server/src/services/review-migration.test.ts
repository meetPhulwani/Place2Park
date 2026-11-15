import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Review } from "../models/index.js";
import { migrateReviews } from "./review-migration.js";

const bookingA = new mongoose.Types.ObjectId();
const bookingB = new mongoose.Types.ObjectId();
const bookingC = new mongoose.Types.ObjectId();
const userId = new mongoose.Types.ObjectId();
const spaceId = new mongoose.Types.ObjectId();

describe("review index migration", () => {
  let memory: MongoMemoryServer;

  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    mongoose.set("autoIndex", false);
    await mongoose.connect(memory.getUri("parkly-review-migration"));
    await Review.collection.dropIndexes();
    await Review.collection.createIndex({ bookingId: 1 }, { unique: true, name: "bookingId_unique" });
    await Review.collection.insertMany([
      { bookingId: bookingA, spaceId, userId, rating: 5, comment: "keep me" },
      { bookingId: bookingB, spaceId, userId, authorRole: "HOST", rating: 2, comment: "host stays" },
      { bookingId: bookingC, spaceId, userId, authorRole: "DRIVER", rating: 4, comment: "already driver" },
    ]);
  });

  after(async () => {
    mongoose.set("autoIndex", true);
    await mongoose.disconnect();
    await memory.stop();
  });

  it("backfills only missing roles, swaps the unique index, and can run twice", async () => {
    const first = await migrateReviews();
    assert.equal(first.modified, 1);
    const legacy = await Review.collection.findOne({ bookingId: bookingA });
    const host = await Review.collection.findOne({ bookingId: bookingB });
    const driver = await Review.collection.findOne({ bookingId: bookingC });
    assert.equal(legacy?.authorRole, "DRIVER");
    assert.equal(legacy?.comment, "keep me");
    assert.equal(legacy?.rating, 5);
    assert.equal(host?.authorRole, "HOST");
    assert.equal(host?.comment, "host stays");
    assert.equal(driver?.authorRole, "DRIVER");
    assert.equal(driver?.comment, "already driver");

    const indexes = await Review.collection.indexes();
    const singleUnique = indexes.find((index) => index.unique && Object.keys(index.key).length === 1 && index.key.bookingId === 1);
    const compound = indexes.find((index) => index.unique && index.key.bookingId === 1 && index.key.authorRole === 1);
    assert.equal(singleUnique, undefined);
    assert.ok(compound);

    await Review.collection.insertOne({
      bookingId: bookingA,
      spaceId,
      userId,
      authorRole: "HOST",
      rating: 3,
      comment: "host side",
    });
    await assert.rejects(() => Review.collection.insertOne({
      bookingId: bookingA,
      spaceId,
      userId,
      authorRole: "DRIVER",
      rating: 1,
      comment: "duplicate driver",
    }));
    assert.equal(await Review.collection.countDocuments({ bookingId: bookingA }), 2);

    const second = await migrateReviews();
    assert.equal(second.modified, 0);
    assert.equal((await Review.collection.findOne({ bookingId: bookingA, authorRole: "DRIVER" }))?.comment, "keep me");
    assert.equal(await Review.collection.countDocuments({ bookingId: bookingA }), 2);
  });
});
