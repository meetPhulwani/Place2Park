/**
 * Dry-run (default) or stamp distinct idempotencyKey values on two known
 * ghost PAID hostpayouts. Never changes status, amount, paidAt, events, or bookingIds.
 * Never deletes documents.
 *
 *   npx tsx src/scripts/stamp-legacy-payout-keys.ts
 *   npx tsx src/scripts/stamp-legacy-payout-keys.ts --apply --confirm
 *
 * Refuses unless both expected IDs match the documented preconditions.
 * Do not run --apply from boot, CI, or seed.
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { applyLegacyPayoutKeyStamps } from "../utils/legacy-payout-keys.js";

const apply = process.argv.includes("--apply");
const confirm = process.argv.includes("--confirm");

async function main() {
  if (!env.MONGODB_URI) {
    console.error("Set MONGODB_URI. This script never deletes data or changes payout status/amount.");
    process.exit(1);
  }
  if (apply && !confirm) {
    console.error("Writes require both --apply and --confirm. Re-run without flags for a dry-run.");
    process.exit(1);
  }

  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB });
  console.info(`[legacy-payout-keys] connected to ${mongoose.connection.name} (${apply ? "apply" : "dry-run"})`);

  const result = await applyLegacyPayoutKeyStamps(mongoose.connection, { apply });
  for (const row of result.updates) {
    const snap = row.snapshot;
    console.info(
      `[legacy-payout-keys] ${row.action} ${row.id} key ${row.from ?? "(missing)"} -> ${row.to} status=${String(snap.status)} amount=${String(snap.amount)} currency=${String(snap.currency)} bookingIds=${JSON.stringify(snap.bookingIds)} paidAt=${String(snap.paidAt)} events=${snap.eventsCount}`
    );
  }

  if (!result.ok) {
    console.error(`[legacy-payout-keys] refused: ${result.reason}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.info(
    `[legacy-payout-keys] ok applied=${result.applied} modified=${result.modifiedCount} (status and amount unchanged)`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[legacy-payout-keys] failed", err instanceof Error ? err.message : err);
  process.exit(1);
});
