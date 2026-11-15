import { Review } from "../models/index.js";

/**
 * Backfills the driver side on older reviews and replaces the single-booking
 * unique index with one review per participant. Safe to run more than once.
 */
export async function migrateReviews() {
  const collection = Review.collection;
  const backfill = await collection.updateMany(
    { $or: [{ authorRole: { $exists: false } }, { authorRole: null }, { authorRole: "" }] },
    { $set: { authorRole: "DRIVER" } }
  );
  const indexes = await collection.indexes();
  for (const index of indexes) {
    const keys = Object.keys(index.key ?? {});
    if (index.unique && keys.length === 1 && keys[0] === "bookingId" && index.name) {
      await collection.dropIndex(index.name);
    }
  }
  await collection.createIndex(
    { bookingId: 1, authorRole: 1 },
    { unique: true, name: "bookingId_1_authorRole_1" }
  );
  return { matched: backfill.matchedCount, modified: backfill.modifiedCount };
}
