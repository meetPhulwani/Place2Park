import type { Connection } from "mongoose";

export type UniqueIndexSpec = {
  collection: string;
  fields: string[];
  unique: true;
  drop: false;
};

/** Unique indexes required for money and account integrity. Never drop these. */
export const REQUIRED_UNIQUE_INDEXES: UniqueIndexSpec[] = [
  { collection: "users", fields: ["email"], unique: true, drop: false },
  { collection: "bookings", fields: ["code"], unique: true, drop: false },
  { collection: "payments", fields: ["bookingId"], unique: true, drop: false },
  { collection: "hostpayouts", fields: ["idempotencyKey"], unique: true, drop: false },
  { collection: "favorites", fields: ["userId", "spaceId"], unique: true, drop: false },
];

export type IndexInspection = {
  collection: string;
  fields: string[];
  existingUnique: boolean;
  existingNonUnique: boolean;
  existingIndexName?: string;
  duplicateCount: number;
  duplicateKeys: string[];
  missingOrNullCount: number;
  missingOrNullIds: string[];
  reconcile: string;
};

export type IndexApplyResult = IndexInspection & {
  created: boolean;
  alreadyExisted: boolean;
  skippedReason?: "duplicates" | "missing_values" | "non_unique_exists" | "dry-run";
  dropped: false;
};

function indexKey(fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, 1 as const]));
}

function sameKey(indexKeyDoc: Record<string, unknown>, fields: string[]) {
  const keys = Object.keys(indexKeyDoc).filter((k) => k !== "_id");
  return keys.length === fields.length && fields.every((field) => indexKeyDoc[field] === 1);
}

async function findDuplicates(connection: Connection, spec: UniqueIndexSpec) {
  const coll = connection.db!.collection(spec.collection);
  const groupId =
    spec.fields.length === 1
      ? `$${spec.fields[0]}`
      : Object.fromEntries(spec.fields.map((field) => [field, `$${field}`]));
  const rows = await coll
    .aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: groupId, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 }, _id: { $ne: null } } },
    ])
    .toArray();
  return rows.map((row) => ({
    key: typeof row._id === "string" ? row._id : JSON.stringify(row._id),
    n: row.n,
  }));
}

/** Missing, null, and empty-string values all collide on a unique index as one key. */
function missingOrNullFilter(fields: string[]) {
  return {
    $or: fields.flatMap((field) => [{ [field]: { $exists: false } }, { [field]: null }, { [field]: "" }]),
  };
}

async function findMissingOrNull(connection: Connection, spec: UniqueIndexSpec) {
  const coll = connection.db!.collection(spec.collection);
  const filter = missingOrNullFilter(spec.fields);
  const missingOrNullCount = await coll.countDocuments(filter);
  const samples = await coll.find(filter).project({ _id: 1 }).limit(20).toArray();
  return {
    missingOrNullCount,
    missingOrNullIds: samples.map((row) => String(row._id)),
  };
}

function classifyExistingIndex(indexes: { key: Record<string, unknown>; unique?: boolean; name?: string }[], fields: string[]) {
  const match = indexes.find((idx) => sameKey(idx.key as Record<string, unknown>, fields));
  if (!match) return { existingUnique: false, existingNonUnique: false, existingIndexName: undefined };
  return {
    existingUnique: !!match.unique,
    existingNonUnique: !match.unique,
    existingIndexName: match.name,
  };
}

function reconcileMessage(
  spec: UniqueIndexSpec,
  duplicateCount: number,
  missingOrNullCount: number,
  existingNonUnique = false
) {
  if (existingNonUnique) {
    return `A non-unique index already exists on ${spec.collection}.${spec.fields.join("+")}. Do not drop or replace it from this script. After reconciling duplicate/missing values, create a uniquely named unique index in Atlas, then remove the non-unique index manually.`;
  }
  if (duplicateCount === 0 && missingOrNullCount === 0) return "No duplicates. Unique index can be created.";
  const parts: string[] = [];
  if (duplicateCount > 0) {
    parts.push(
      `Reconcile ${duplicateCount} duplicate ${spec.fields.join("+")} value(s) on ${spec.collection}`
    );
  }
  if (missingOrNullCount > 0) {
    parts.push(
      `Assign distinct ${spec.fields.join("+")} values to ${missingOrNullCount} ${spec.collection} document(s) with missing/null/empty keys`
    );
  }
  return `${parts.join(". ")} before creating the unique index. Do not delete live money rows without an operator review.`;
}

export async function inspectUniqueIndexes(connection: Connection): Promise<IndexInspection[]> {
  const out: IndexInspection[] = [];
  for (const spec of REQUIRED_UNIQUE_INDEXES) {
    const indexes = await connection.db!.collection(spec.collection).indexes();
    const existing = classifyExistingIndex(
      indexes as { key: Record<string, unknown>; unique?: boolean; name?: string }[],
      spec.fields
    );
    const dups = await findDuplicates(connection, spec);
    const missing = await findMissingOrNull(connection, spec);
    out.push({
      collection: spec.collection,
      fields: spec.fields,
      existingUnique: existing.existingUnique,
      existingNonUnique: existing.existingNonUnique,
      existingIndexName: existing.existingIndexName,
      duplicateCount: dups.length,
      duplicateKeys: dups.map((d) => d.key).slice(0, 20),
      missingOrNullCount: missing.missingOrNullCount,
      missingOrNullIds: missing.missingOrNullIds,
      reconcile: reconcileMessage(spec, dups.length, missing.missingOrNullCount, existing.existingNonUnique),
    });
  }
  return out;
}

export async function applyUniqueIndexes(
  connection: Connection,
  opts: { apply?: boolean } = {}
): Promise<IndexApplyResult[]> {
  const apply = !!opts.apply;
  const inspections = await inspectUniqueIndexes(connection);
  const results: IndexApplyResult[] = [];
  for (let i = 0; i < REQUIRED_UNIQUE_INDEXES.length; i += 1) {
    const spec = REQUIRED_UNIQUE_INDEXES[i]!;
    const inspection = inspections[i]!;
    if (inspection.existingUnique) {
      results.push({ ...inspection, created: false, alreadyExisted: true, dropped: false });
      continue;
    }
    if (inspection.existingNonUnique) {
      results.push({
        ...inspection,
        created: false,
        alreadyExisted: false,
        skippedReason: "non_unique_exists",
        dropped: false,
      });
      continue;
    }
    if (inspection.duplicateCount > 0) {
      results.push({
        ...inspection,
        created: false,
        alreadyExisted: false,
        skippedReason: "duplicates",
        dropped: false,
      });
      continue;
    }
    if (inspection.missingOrNullCount > 0) {
      results.push({
        ...inspection,
        created: false,
        alreadyExisted: false,
        skippedReason: "missing_values",
        dropped: false,
      });
      continue;
    }
    if (!apply) {
      results.push({
        ...inspection,
        created: false,
        alreadyExisted: false,
        skippedReason: "dry-run",
        dropped: false,
      });
      continue;
    }
    await connection.db!.collection(spec.collection).createIndex(indexKey(spec.fields), {
      unique: true,
      background: true,
      name: `${spec.fields.join("_")}_1`,
    });
    results.push({ ...inspection, created: true, alreadyExisted: false, dropped: false });
  }
  return results;
}
