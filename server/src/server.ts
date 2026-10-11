import { env, isProd } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { createApp } from "./app.js";
import { ParkingSpace } from "./models/ParkingSpace.js";

async function main() {
  const { inMemory } = await connectDb();
  if (isProd && inMemory) {
    throw new Error("In-memory MongoDB is not allowed in production.");
  }
  if (!isProd) {
    const count = await ParkingSpace.countDocuments();
    if (inMemory || count === 0) {
      if (count === 0) console.warn("[db] no parking spaces found — seeding demo data");
      const { seed } = await import("./seed.js");
      await seed();
    }
  }
  const app = createApp();
  app.listen(env.PORT, () => console.info(`[server] Parkly API on http://localhost:${env.PORT}`));
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
