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
  duplicateCount: number;
  duplicateKeys: string[];
  reconcile: string;
};

export type IndexApplyResult = IndexInspection & {
  created: boolean;
  alreadyExisted: boolean;
  skippedReason?: "duplicates" | "dry-run";
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

function reconcileMessage(spec: UniqueIndexSpec, duplicateCount: number) {
  if (duplicateCount === 0) return "No duplicates. Unique index can be created.";
  return `Reconcile ${duplicateCount} duplicate ${spec.fields.join("+")} value(s) on ${spec.collection} before creating the unique index. Do not delete live money rows without an operator review.`;
}

export async function inspectUniqueIndexes(connection: Connection): Promise<IndexInspection[]> {
  const out: IndexInspection[] = [];
  for (const spec of REQUIRED_UNIQUE_INDEXES) {
    const indexes = await connection.db!.collection(spec.collection).indexes();
    const existingUnique = indexes.some((idx) => idx.unique && sameKey(idx.key as Record<string, unknown>, spec.fields));
    const dups = await findDuplicates(connection, spec);
    out.push({
      collection: spec.collection,
      fields: spec.fields,
      existingUnique,
      duplicateCount: dups.length,
      duplicateKeys: dups.map((d) => d.key).slice(0, 20),
      reconcile: reconcileMessage(spec, dups.length),
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
