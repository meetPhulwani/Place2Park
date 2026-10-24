
import mongoose from "mongoose";
import { env } from "./src/config/env.js";

async function main() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB,
    });

    const db = mongoose.connection.db!;

    const collection = db.collection("hostpayouts");
    const bookings = db.collection("bookings");

    // Find payouts with missing or null idempotencyKey.
    const records = await collection
      .find(
        {
          $or: [
            { idempotencyKey: { $exists: false } },
            { idempotencyKey: null },
          ],
        },
        {
          projection: {
            _id: 1,
            hostId: 1,
            status: 1,
            amount: 1,
            idempotencyKey: 1,
            bookingIds: 1,
            reference: 1,
            paidAt: 1,
            createdAt: 1,
            events: 1,
            periodStart: 1,
            periodEnd: 1,
          },
        }
      )
      .toArray();

    console.log(
      `Found ${records.length} payouts with missing/null idempotencyKey.`
    );

    for (const record of records) {
      const payoutId = String(record._id);
      const ids = Array.isArray(record.bookingIds)
        ? record.bookingIds
        : [];

      console.log("\n========================================");
      console.log("Payout ID:", payoutId);
      console.log("Host ID:", String(record.hostId ?? ""));
      console.log("Status:", record.status);
      console.log("Amount (paise):", record.amount);
      console.log("Amount (INR):", Number(record.amount ?? 0) / 100);
      console.log("idempotencyKey:", record.idempotencyKey);
      console.log("Booking IDs:", ids);
      console.log("Reference:", record.reference);
      console.log("Paid at:", record.paidAt);
      console.log("Created at:", record.createdAt);
      console.log("Period:", record.periodStart, "to", record.periodEnd);
      console.log("Events:", record.events);

      // Check bookings explicitly stored on the payout.
      if (ids.length > 0) {
        const linkedBookings = await bookings
          .find(
            { _id: { $in: ids } },
            {
              projection: {
                _id: 1,
                hostId: 1,
                status: 1,
                hostEarning: 1,
                payoutId: 1,
              },
            }
          )
          .toArray();

        console.log("Bookings listed in payout:");
        console.dir(linkedBookings, { depth: null });
      } else {
        console.log("No booking IDs stored on this payout.");
      }

      // Check whether any booking references this payout.
      const referencedCount = await bookings.countDocuments({
        payoutId: record._id,
      });

      console.log(
        `Bookings referencing this payout: ${referencedCount}`
      );

      if (referencedCount > 0) {
        const referencedBookings = await bookings
          .find(
            { payoutId: record._id },
            {
              projection: {
                _id: 1,
                hostId: 1,
                status: 1,
                hostEarning: 1,
                payoutId: 1,
              },
            }
          )
          .toArray();

        console.log("Referencing booking details:");
        console.dir(referencedBookings, { depth: null });
      }
    }

    // Inspect existing hostpayouts indexes.
    const indexes = await collection.indexes();

    console.log("\n========================================");
    console.log("Current hostpayouts indexes:");

    console.dir(
      indexes.map(
        ({ name, key, unique, sparse, partialFilterExpression }) => ({
          name,
          key,
          unique,
          sparse,
          partialFilterExpression,
        })
      ),
      { depth: null }
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Payout inspection failed:", error);
  process.exitCode = 1;
});
