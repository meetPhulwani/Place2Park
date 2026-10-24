import type { Connection } from "mongoose";
import mongoose from "mongoose";

/** Atlas test rows that are PAID but have no idempotencyKey and no bookings. */
export const LEGACY_PAYOUT_IDS = [
  "6aca47868ea9ca4c01017b91",
  "6aca47868ea9ca4c01017b92",
] as const;

export function legacyPayoutIdempotencyKey(id: string) {
  return `legacy:untracked:${id}`;
}

function isBlankKey(value: unknown) {
  return value == null || value === "";
}

function bookingIdsEmpty(value: unknown) {
  return !Array.isArray(value) || value.length === 0;
}

export type LegacyPayoutSnapshot = {
  id: string;
  status: unknown;
  amount: unknown;
  currency: unknown;
  bookingIds: unknown;
  paidAt: unknown;
  eventsCount: number;
  idempotencyKey: unknown;
  proposedKey: string;
};

export type LegacyPayoutUpdate = {
  id: string;
  action: "stamp" | "already";
  from: string | null;
  to: string;
  snapshot: LegacyPayoutSnapshot;
};

export type LegacyPayoutPlan = {
  ok: boolean;
  reason?: string;
  updates: LegacyPayoutUpdate[];
};

export type LegacyPayoutApplyResult = LegacyPayoutPlan & {
  applied: boolean;
  modifiedCount: number;
};

function snapshot(doc: Record<string, unknown>, id: string): LegacyPayoutSnapshot {
  const events = doc.events;
  return {
    id,
    status: doc.status,
    amount: doc.amount,
    currency: doc.currency,
    bookingIds: doc.bookingIds ?? [],
    paidAt: doc.paidAt ?? null,
    eventsCount: Array.isArray(events) ? events.length : 0,
    idempotencyKey: doc.idempotencyKey ?? null,
    proposedKey: legacyPayoutIdempotencyKey(id),
  };
}

export async function planLegacyPayoutKeyStamps(connection: Connection): Promise<LegacyPayoutPlan> {
  const payouts = connection.db!.collection("hostpayouts");
  const bookings = connection.db!.collection("bookings");
  const objectIds = LEGACY_PAYOUT_IDS.map((id) => new mongoose.Types.ObjectId(id));
  const docs = await payouts.find({ _id: { $in: objectIds } }).toArray();
  const byId = new Map(docs.map((doc) => [String(doc._id), doc]));

  const missing = LEGACY_PAYOUT_IDS.filter((id) => !byId.has(id));
  if (missing.length) {
    return { ok: false, reason: `Expected payout(s) not found: ${missing.join(", ")}`, updates: [] };
  }

  const referenced = await bookings.find({ payoutId: { $in: objectIds } }).project({ _id: 1, payoutId: 1 }).toArray();
  if (referenced.length) {
    return {
      ok: false,
      reason: `Booking(s) still reference a target payout: ${referenced.map((row) => String(row._id)).join(", ")}`,
      updates: [],
    };
  }

  const updates: LegacyPayoutUpdate[] = [];
  for (const id of LEGACY_PAYOUT_IDS) {
    const doc = byId.get(id)!;
    const proposed = legacyPayoutIdempotencyKey(id);
    const current = doc.idempotencyKey;
    const row: LegacyPayoutUpdate = {
      id,
      action: isBlankKey(current) ? "stamp" : "already",
      from: isBlankKey(current) ? null : String(current),
      to: proposed,
      snapshot: snapshot(doc as Record<string, unknown>, id),
    };

    if (doc.status !== "PAID") {
      return {
        ok: false,
        reason: `Payout ${id} is ${String(doc.status)}, expected PAID. Refusing to change it.`,
        updates: [row],
      };
    }
    if (!bookingIdsEmpty(doc.bookingIds)) {
      return { ok: false, reason: `Payout ${id} has bookingIds; refusing to stamp a live payout.`, updates: [row] };
    }
    if (!isBlankKey(current) && current !== proposed) {
      return { ok: false, reason: `Payout ${id} already has an existing key; refusing to overwrite.`, updates: [row] };
    }

    const clash = await payouts.findOne({
      idempotencyKey: proposed,
      _id: { $ne: new mongoose.Types.ObjectId(id) },
    });
    if (clash) {
      return {
        ok: false,
        reason: `Proposed key for ${id} already used by ${String(clash._id)} (collision).`,
        updates: [row],
      };
    }

    updates.push(row);
  }

  return { ok: true, updates };
}

export function legacyPayoutStampFilter(id: string, amount: unknown) {
  return {
    _id: new mongoose.Types.ObjectId(id),
    status: "PAID",
    amount,
    $and: [
      { $or: [{ idempotencyKey: { $exists: false } }, { idempotencyKey: null }, { idempotencyKey: "" }] },
      { $or: [{ bookingIds: { $exists: false } }, { bookingIds: null }, { bookingIds: { $size: 0 } }] },
    ],
  };
}

export async function applyLegacyPayoutKeyStamps(
  connection: Connection,
  opts: { apply?: boolean; beforeWrite?: () => Promise<void> } = {}
): Promise<LegacyPayoutApplyResult> {
  const plan = await planLegacyPayoutKeyStamps(connection);
  if (!plan.ok || !opts.apply) {
    return { ...plan, applied: false, modifiedCount: 0 };
  }

  if (opts.beforeWrite) await opts.beforeWrite();

  const payouts = connection.db!.collection("hostpayouts");
  let modifiedCount = 0;
  for (const row of plan.updates) {
    if (row.action !== "stamp") continue;
    const result = await payouts.updateOne(legacyPayoutStampFilter(row.id, row.snapshot.amount), {
      $set: { idempotencyKey: row.to },
    });
    if (result.matchedCount !== 1) {
      return {
        ...plan,
        ok: false,
        reason: `Concurrent change: payout ${row.id} no longer matches stamp preconditions.`,
        applied: modifiedCount > 0,
        modifiedCount,
      };
    }
    modifiedCount += result.modifiedCount;
    const fresh = await payouts.findOne({ _id: new mongoose.Types.ObjectId(row.id) });
    if (!fresh || fresh.status !== "PAID" || fresh.amount !== row.snapshot.amount) {
      return {
        ...plan,
        ok: false,
        reason: `Refusing to continue: payout ${row.id} status or amount changed.`,
        applied: true,
        modifiedCount,
      };
    }
  }
  return { ...plan, applied: true, modifiedCount };
}
