import { env, isProd } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { createApp } from "./app.js";
import { ParkingSpace } from "./models/ParkingSpace.js";
import { startBackgroundMaintenance } from "./services/maintenance.js";
import { adminConsolePath, adminSessionSecret, assertAdminConsolePath, assertAdminSessionSecret, assertTotpKey } from "./utils/admin-secret.js";
import { assertRedisUrl } from "./utils/shared-counter.js";

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
  assertAdminConsolePath(env.NODE_ENV, adminConsolePath());
  assertAdminSessionSecret(env.NODE_ENV, adminSessionSecret());
  assertTotpKey(env.NODE_ENV, process.env.ADMIN_TOTP_KEY ?? "", adminSessionSecret(), env.JWT_SECRET);
  assertRedisUrl(env.NODE_ENV, process.env.REDIS_URL ?? "");
  if (!isProd && !process.env.REDIS_URL) console.warn("[rate-limit] REDIS_URL is not set; counters stay on this process.");
  if (!process.env.AUDIT_ARCHIVE_URL) console.warn("[audit] No external archive is configured. A database administrator can still change audit rows.");
  if (!isProd && !adminConsolePath()) console.warn("[console] UI is not mounted.");
  const app = createApp();
  startBackgroundMaintenance();
  app.listen(env.PORT, () => console.info(`[server] Parkly API on http://localhost:${env.PORT}`));
}

main().catch((e) => {
  console.error("Failed to start server:", e);
  process.exit(1);
});
