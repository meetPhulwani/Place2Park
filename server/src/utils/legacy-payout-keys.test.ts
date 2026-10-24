import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  LEGACY_PAYOUT_IDS,
  applyLegacyPayoutKeyStamps,
  legacyPayoutIdempotencyKey,
  planLegacyPayoutKeyStamps,
} from "./legacy-payout-keys.js";

let memory: MongoMemoryServer;

const [ID_A, ID_B] = LEGACY_PAYOUT_IDS;

function oid(id: string) {
  return new mongoose.Types.ObjectId(id);
}

function ghost(id: string, extra: Record<string, unknown> = {}) {
  return {
    _id: oid(id),
    hostId: new mongoose.Types.ObjectId(),
    status: "PAID",
    amount: 2500,
    currency: "INR",
    bookingIds: [],
    events: [],
    ...extra,
  };
}

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-legacy-payout-test"));
});

after(async () => {
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await mongoose.connection.db!.collection("hostpayouts").deleteMany({});
  await mongoose.connection.db!.collection("bookings").deleteMany({});
});

describe("legacy payout idempotency keys", () => {
  it("uses a distinct stable key per payout id", () => {
    assert.equal(legacyPayoutIdempotencyKey(ID_A), `legacy:untracked:${ID_A}`);
    assert.equal(legacyPayoutIdempotencyKey(ID_B), `legacy:untracked:${ID_B}`);
    assert.notEqual(legacyPayoutIdempotencyKey(ID_A), legacyPayoutIdempotencyKey(ID_B));
  });

  it("plans stamps for the two known ghost PAID rows and does not write on dry-run", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.insertMany([ghost(ID_A), ghost(ID_B, { idempotencyKey: null })]);
    const plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, true);
    assert.equal(plan.updates.length, 2);
    assert.equal(plan.updates.every((row) => row.action === "stamp"), true);
    assert.deepEqual(
      plan.updates.map((row) => row.to),
      [legacyPayoutIdempotencyKey(ID_A), legacyPayoutIdempotencyKey(ID_B)]
    );

    const dry = await applyLegacyPayoutKeyStamps(mongoose.connection, { apply: false });
    assert.equal(dry.applied, false);
    const after = await payouts.find({ _id: { $in: [oid(ID_A), oid(ID_B)] } }).toArray();
    assert.equal(after.every((row) => !row.idempotencyKey), true);
    assert.equal(after.every((row) => row.status === "PAID" && row.amount === 2500), true);
  });

  it("stamps only idempotencyKey and is idempotent when keys are already correct", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.insertMany([ghost(ID_A), ghost(ID_B)]);
    const first = await applyLegacyPayoutKeyStamps(mongoose.connection, { apply: true });
    assert.equal(first.ok, true);
    assert.equal(first.applied, true);
    assert.equal(first.modifiedCount, 2);

    const stamped = await payouts.find({ _id: { $in: [oid(ID_A), oid(ID_B)] } }).toArray();
    assert.equal(stamped[0]?.idempotencyKey, legacyPayoutIdempotencyKey(String(stamped[0]?._id)));
    assert.equal(stamped[1]?.idempotencyKey, legacyPayoutIdempotencyKey(String(stamped[1]?._id)));
    assert.equal(stamped.every((row) => row.status === "PAID" && row.amount === 2500 && !row.paidAt), true);

    const second = await applyLegacyPayoutKeyStamps(mongoose.connection, { apply: true });
    assert.equal(second.ok, true);
    assert.equal(second.modifiedCount, 0);
    assert.equal(second.updates.every((row) => row.action === "already"), true);
  });

  it("refuses if an expected payout is missing, has another key, is not PAID, or has bookings", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    const bookings = mongoose.connection.db!.collection("bookings");

    await payouts.insertMany([ghost(ID_A)]);
    let plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /missing|not found/i);

    await payouts.deleteMany({});
    await payouts.insertMany([ghost(ID_A, { idempotencyKey: "manual:keep-me" }), ghost(ID_B)]);
    plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /existing key|overwrite/i);

    await payouts.deleteMany({});
    await payouts.insertMany([ghost(ID_A, { status: "REQUESTED" }), ghost(ID_B)]);
    plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /PAID/i);

    await payouts.deleteMany({});
    await payouts.insertMany([ghost(ID_A, { bookingIds: [new mongoose.Types.ObjectId()] }), ghost(ID_B)]);
    plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /booking/i);

    await payouts.deleteMany({});
    await payouts.insertMany([ghost(ID_A), ghost(ID_B)]);
    await bookings.insertOne({ payoutId: oid(ID_A), status: "COMPLETED" });
    plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /reference/i);

    const applied = await applyLegacyPayoutKeyStamps(mongoose.connection, { apply: true });
    assert.equal(applied.ok, false);
    assert.equal(applied.applied, false);
    assert.equal(applied.modifiedCount, 0);
    const unchanged = await payouts.find({ _id: oid(ID_A) }).toArray();
    assert.equal(unchanged[0]?.idempotencyKey, undefined);
  });

  it("does not stamp if a concurrent write breaks preconditions between plan and update", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.insertMany([ghost(ID_A), ghost(ID_B)]);
    const result = await applyLegacyPayoutKeyStamps(mongoose.connection, {
      apply: true,
      beforeWrite: async () => {
        await payouts.updateOne({ _id: oid(ID_A) }, { $set: { bookingIds: [new mongoose.Types.ObjectId()] } });
      },
    });
    assert.equal(result.ok, false);
    assert.match(result.reason ?? "", /concurrent/i);
    const a = await payouts.findOne({ _id: oid(ID_A) });
    assert.equal(a?.idempotencyKey, undefined);
    assert.equal(a?.status, "PAID");
    assert.equal(a?.amount, 2500);
  });

  it("refuses if the proposed key already belongs to another payout", async () => {
    const payouts = mongoose.connection.db!.collection("hostpayouts");
    await payouts.insertMany([
      ghost(ID_A),
      ghost(ID_B),
      {
        _id: new mongoose.Types.ObjectId(),
        hostId: new mongoose.Types.ObjectId(),
        status: "REQUESTED",
        amount: 1,
        idempotencyKey: legacyPayoutIdempotencyKey(ID_A),
      },
    ]);
    const plan = await planLegacyPayoutKeyStamps(mongoose.connection);
    assert.equal(plan.ok, false);
    assert.match(plan.reason ?? "", /already used|collision|clash/i);
  });
});
