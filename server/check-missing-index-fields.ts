
import mongoose from "mongoose";
import { env } from "./src/config/env.js";

async function main() {
  try {
    await mongoose.connect(env.MONGODB_URI, {
      dbName: env.MONGODB_DB,
    });

    const checks: Record<string, string[]> = {
      users: ["email"],
      bookings: ["code"],
      payments: ["bookingId"],
      hostpayouts: ["idempotencyKey"],
      favorites: ["userId", "spaceId"],
    };

    for (const [collectionName, fields] of Object.entries(checks)) {
      const collection =
        mongoose.connection.db!.collection(collectionName);

      for (const field of fields) {
        const count = await collection.countDocuments({
          $or: [
            { [field]: { $exists: false } },
            { [field]: null },
          ],
        });

        console.log(
          `${collectionName}.${field} missing_or_null=${count}`
        );
      }
    }
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
