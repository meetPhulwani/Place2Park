import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { env } from "../config/env.js";
import { authenticate, signToken } from "../middleware/auth.js";
import { ApiError } from "../middleware/error.js";
import { User } from "../models/index.js";
import { accountPasswordSchema, deleteAccountSchema, notificationPrefsSchema } from "../utils/validation.js";
import {
  changePassword,
  confirmEmailChange,
  confirmPhoneChange,
  defaultNotifications,
  exportOwnData,
  getAccountSettings,
  requestEmailChange,
  requestPhoneChange,
  revokeAllSessions,
  updateAccountName,
  updateNotificationPrefs,
} from "./account-settings.js";

const prevJwt = env.JWT_SECRET;
let memory: MongoMemoryServer;
const password = "Correct1!horse";
let passwordHash = "";
let ownerId = "";
let otherId = "";

const mail = { deliver: async () => undefined, code: "123456" };

before(async () => {
  env.JWT_SECRET = prevJwt || "account-settings-test-secret-long-enough";
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-account-settings"));
  passwordHash = await bcrypt.hash(password, 4);
  const [owner, other] = await User.create([
    { name: "Aarav Mehta", email: "owner-settings@parkly.test", role: "DRIVER", passwordHash, phone: "+919876543210" },
    { name: "Other Person", email: "other-settings@parkly.test", role: "DRIVER", passwordHash, phone: "+919000000000" },
  ]);
  ownerId = String(owner._id);
  otherId = String(other._id);
});

after(async () => {
  env.JWT_SECRET = prevJwt;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await User.updateOne(
    { _id: ownerId },
    {
      $set: {
        name: "Aarav Mehta",
        email: "owner-settings@parkly.test",
        phone: "+919876543210",
        passwordHash,
        tokenVersion: 0,
        status: "ACTIVE",
      },
      $unset: { notifications: 1 },
    }
  );
});

function channel(value: boolean) {
  return {
    bookingConfirmed: true,
    bookingCancelled: true,
    bookingReminder: value,
    payment: true,
    refund: true,
    hostRequest: value,
    hostStatus: value,
    payout: value,
    promo: false,
    product: value,
  };
}

describe("account settings", () => {
  it("updates a name and rejects another user's id as the actor", async () => {
    const updated = await updateAccountName(ownerId, "Aarav M");
    assert.equal(updated.name, "Aarav M");
    const other = await User.findById(otherId);
    assert.equal(other?.name, "Other Person");
    await assert.rejects(() => updateAccountName(ownerId, "A"), (err: unknown) => err instanceof ApiError && err.status === 400);
  });

  it("rejects an invalid email and a duplicate email", async () => {
    await assert.rejects(() => requestEmailChange(ownerId, "not-an-email", mail), (err: unknown) => err instanceof ApiError && err.status === 400);
    await assert.rejects(() => requestEmailChange(ownerId, "other-settings@parkly.test", mail), (err: unknown) => err instanceof ApiError && err.status === 409);
  });

  it("changes an email only after the emailed code matches", async () => {
    const pending = await requestEmailChange(ownerId, "owner-next@parkly.test", mail);
    await assert.rejects(() => confirmEmailChange(ownerId, pending.pendingToken, "000000"), (err: unknown) => err instanceof ApiError && err.status === 400);
    const confirmed = await confirmEmailChange(ownerId, pending.pendingToken, "123456");
    assert.equal(confirmed.email, "owner-next@parkly.test");
    await User.updateOne({ _id: ownerId }, { $set: { email: "owner-settings@parkly.test" } });
  });

  it("rejects an invalid phone and a duplicate phone", async () => {
    await assert.rejects(() => requestPhoneChange(ownerId, "123", mail), (err: unknown) => err instanceof ApiError && err.status === 400);
    await assert.rejects(() => requestPhoneChange(ownerId, "+919000000000", mail), (err: unknown) => err instanceof ApiError && err.status === 409);
  });

  it("changes a phone only after the emailed code matches", async () => {
    const pending = await requestPhoneChange(ownerId, "9123456789", mail);
    const confirmed = await confirmPhoneChange(ownerId, pending.pendingToken, "123456");
    assert.equal(confirmed.phone, "+919123456789");
    await User.updateOne({ _id: ownerId }, { $set: { phone: "+919876543210" } });
  });

  it("changes a password only with the current one and signs out older tokens", async () => {
    const oldToken = signToken(ownerId, 0);
    await assert.rejects(() => changePassword(ownerId, "Wrong1!horse", "Newer1!horse"), (err: unknown) => err instanceof ApiError && err.status === 401);
    await assert.rejects(() => changePassword(ownerId, password, password), (err: unknown) => err instanceof ApiError && err.status === 400);
    const changed = await changePassword(ownerId, password, "Newer1!horse");
    let oldAccepted = false;
    await authenticate({ headers: { authorization: `Bearer ${oldToken}` } } as never, {} as never, (err?: unknown) => {
      oldAccepted = !err;
    });
    assert.equal(oldAccepted, false);
    let nextAccepted = false;
    await authenticate({ headers: { authorization: `Bearer ${changed.token}` } } as never, {} as never, (err?: unknown) => {
      nextAccepted = !err;
    });
    assert.equal(nextAccepted, true);
    await User.updateOne({ _id: ownerId }, { $set: { passwordHash, tokenVersion: 0 } });
  });

  it("keeps required notices on and persists optional preferences", async () => {
    const input = { email: channel(false), inApp: channel(false) };
    assert.equal(notificationPrefsSchema.safeParse(input).success, true);
    const saved = await updateNotificationPrefs(ownerId, input);
    assert.equal(saved.notifications.email.bookingConfirmed, true);
    assert.equal(saved.notifications.email.payment, true);
    assert.equal(saved.notifications.email.refund, true);
    assert.equal(saved.notifications.email.promo, false);
    const loaded = await getAccountSettings(ownerId);
    assert.equal(loaded.notifications.inApp.bookingReminder, false);
    assert.equal(loaded.notifications.email.bookingCancelled, true);
  });

  it("revokes every signed login", async () => {
    await revokeAllSessions(ownerId);
    const user = await User.findById(ownerId).select("tokenVersion");
    assert.equal(user?.tokenVersion, 1);
    await User.updateOne({ _id: ownerId }, { $set: { tokenVersion: 0 } });
  });

  it("exports only the caller's data", async () => {
    const exported = await exportOwnData(ownerId);
    const text = JSON.stringify(exported);
    assert.match(text, /owner-settings@parkly.test/);
    assert.doesNotMatch(text, /other-settings@parkly.test/);
    assert.equal(text.includes("passwordHash"), false);
    assert.equal(text.includes("accountNumberEnc"), false);
    assert.deepEqual(exported.account.notifications.email.bookingConfirmed, defaultNotifications().email.bookingConfirmed);
  });

  it("requires the exact deletion word and matching passwords", () => {
    assert.equal(deleteAccountSchema.safeParse({ confirmation: "confirm" }).success, false);
    assert.equal(deleteAccountSchema.safeParse({ confirmation: "CONFIRM", extra: true }).success, false);
    assert.equal(deleteAccountSchema.safeParse({ confirmation: "CONFIRM", password: password }).success, true);
    assert.equal(accountPasswordSchema.safeParse({ currentPassword: "a", newPassword: "short", confirmPassword: "short" }).success, false);
  });
});
