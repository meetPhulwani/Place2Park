/**
 * Dry-run (default) or apply unique indexes required for production.
 *
 * Does NOT drop indexes. Does NOT delete duplicate documents.
 * Refuses to create a unique index while duplicates exist.
 *
 *   npx tsx src/scripts/ensure-indexes.ts
 *   npx tsx src/scripts/ensure-indexes.ts --apply
 *
 * Never run --apply against production until the printed duplicates are reconciled.
 */
import mongoose from "mongoose";
import { env } from "../config/env.js";
import { applyUniqueIndexes, inspectUniqueIndexes, type IndexApplyResult } from "../utils/indexes.js";

const apply = process.argv.includes("--apply");

async function main() {
  if (!env.MONGODB_URI) {
    console.error("Set MONGODB_URI. This script never deletes data or drops indexes.");
    process.exit(1);
  }
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB });
  console.info(`[indexes] connected to ${mongoose.connection.name} (${apply ? "apply" : "dry-run"})`);
  const report = apply
    ? await applyUniqueIndexes(mongoose.connection, { apply: true })
    : await inspectUniqueIndexes(mongoose.connection);
  for (const row of report) {
    const applied = row as IndexApplyResult;
    const extra =
      "created" in row
        ? ` created=${applied.created} existed=${applied.alreadyExisted} skipped=${applied.skippedReason ?? "—"} dropped=${applied.dropped}`
        : "";
    console.info(
      `[indexes] ${row.collection}.${row.fields.join("+")} unique=${row.existingUnique} duplicates=${row.duplicateCount}${extra}`
    );
    if (row.duplicateCount > 0) console.info(`[indexes] ${row.reconcile}`);
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("[indexes] failed", err instanceof Error ? err.message : err);
  process.exit(1);
});
