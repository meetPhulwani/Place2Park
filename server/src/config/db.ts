import mongoose from "mongoose";
import { env, isProd } from "./env.js";
import { ParkingSpace } from "../models/ParkingSpace.js";

/**
 * Connects to MongoDB. When MONGODB_URI is unset in development, spins up an
 * in-memory MongoDB (clearly a dev fallback) so the app runs with zero config.
 */
export async function connectDb(): Promise<{ inMemory: boolean }> {
  mongoose.set("autoIndex", !isProd);

  if (env.MONGODB_URI) {
    // Always use a dedicated Parkly database. Atlas URIs without a path default
    // to "test", which mixed other apps' collections and left parkingspaces empty.
    await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB });
    console.info(`[db] connected to MongoDB (${mongoose.connection.name})`);
    await ParkingSpace.syncIndexes();
    await repairSwappedGeoJson();
    if (!isProd) {
      const { backfillParkingLocations, ensureDemoRegionalSpaces, repairUnknownLocations } = await import(
        "../utils/backfill-locations.js"
      );
      await backfillParkingLocations();
      await ensureDemoRegionalSpaces();
      await repairUnknownLocations();
    }
    return { inMemory: false };
  }

  if (isProd) throw new Error("MONGODB_URI is required in production.");

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mem = await MongoMemoryServer.create({
    instance: { launchTimeout: 120000 },
  });
  await mongoose.connect(mem.getUri("parkly"));
  console.warn("[db] MONGODB_URI not set — using in-memory MongoDB (dev fallback, data resets on restart)");
  await ParkingSpace.syncIndexes();
  return { inMemory: true };
}

/**
 * GeoJSON is [lng, lat]. Older documents sometimes stored [lat, lng].
 * Detect India-range latitude in position 0 and swap — generic, not area-specific.
 */
async function repairSwappedGeoJson() {
  const swapped = await ParkingSpace.find({
    "location.coordinates.0": { $gte: 8, $lte: 37 },
    "location.coordinates.1": { $gte: 68, $lte: 97 },
  }).select("location title");
  if (swapped.length === 0) return;
  for (const s of swapped) {
    const loc = s.location;
    if (!loc?.coordinates || loc.coordinates.length < 2) continue;
    const [a, b] = loc.coordinates as number[];
    loc.coordinates = [b, a];
    await s.save();
  }
  console.warn(`[db] repaired ${swapped.length} GeoJSON point(s) with swapped lat/lng`);
}
