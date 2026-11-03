import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { Booking } from "../models/Booking.js";
import { EmailOtpPending } from "../models/EmailOtpPending.js";
import { ParkingSpace } from "../models/ParkingSpace.js";
import { User } from "../models/User.js";
import { ApiError } from "../middleware/error.js";
import { authenticate, signToken, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../config/env.js";
import {
  beginGoogleSignIn,
  completeEmailOtp,
  resendEmailOtp,
  startSignupEmailOtp,
  type MailDeps,
} from "./email-otp.js";

let memory: MongoMemoryServer;
const prevJwt = env.JWT_SECRET;
const mailbox: { to: string; text: string }[] = [];
const logs: string[] = [];

const mail: MailDeps = {
  isProd: false,
  log: (line) => logs.push(line),
  send: async (msg) => {
    mailbox.push({ to: msg.to, text: msg.text });
  },
};

function latestCode() {
  const text = mailbox.at(-1)?.text ?? "";
  const match = text.match(/\b(\d{6})\b/);
  if (!match) throw new Error("verification email was not captured");
  return match[1];
}

function assertCodeStaysOffLogs(code: string) {
  assert.equal(logs.some((line) => line.includes(code)), false);
}

async function runAuth(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as Request;
  let err: unknown;
  await authenticate(req, {} as Response, (error) => {
    err = error;
  });
  return { req: req as AuthedRequest, err };
}

before(async () => {
  env.JWT_SECRET = "email-otp-test-secret-which-is-32chars";
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-email-otp"));
});

after(async () => {
  env.JWT_SECRET = prevJwt;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  mailbox.length = 0;
  logs.length = 0;
  await Promise.all([
    User.deleteMany({}),
    Booking.deleteMany({}),
    ParkingSpace.deleteMany({}),
    EmailOtpPending.deleteMany({}),
  ]);
});

describe("email OTP signup", () => {
  const signup = {
    name: "Aarav Mehta",
    email: "aarav.mehta@gmail.com",
    password: "GoodPass1!",
    role: "HOST" as const,
    phone: "+919876543210",
  };

  it("does not create an account before the email code is verified", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    const code = latestCode();
    assert.equal(started.kind, "email");
    assert.equal(started.maskedEmail, "a****@gmail.com");
    assert.equal(JSON.stringify(started).includes(code), false);
    assertCodeStaysOffLogs(code);
    assert.equal(await User.countDocuments({}), 0);
  });

  it("creates the account and session only after the code matches", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    const code = latestCode();
    const user = await completeEmailOtp(started.pendingToken, code);
    const stored = await User.findById(user._id).select("+passwordHash");
    assert.equal(stored?.role, "HOST");
    assert.equal(stored?.phone, "+919876543210");
    assert.equal(stored?.phoneVerified, false);
    assert.equal(await bcrypt.compare(signup.password, stored?.passwordHash ?? ""), true);
    const access = await runAuth(signToken(String(user._id), 0));
    assert.equal(access.err, undefined);
    assert.equal(access.req.userId, String(user._id));
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, code),
      (err: unknown) => err instanceof ApiError && err.status === 400
    );
    assert.equal(await User.countDocuments({}), 1);
  });

  it("rejects an incorrect code and does not create the account", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, "000000"),
      (err: unknown) => err instanceof ApiError && err.message === "That code is incorrect."
    );
    assert.equal(await User.countDocuments({}), 0);
  });

  it("rejects an expired code", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    await EmailOtpPending.updateMany({}, { $set: { codeExpiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, latestCode()),
      (err: unknown) => err instanceof ApiError && err.message === "That code has expired."
    );
    assert.equal(await User.countDocuments({}), 0);
  });

  it("invalidates the previous code when a new one is sent", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    const first = latestCode();
    await EmailOtpPending.updateMany({}, { $set: { sentAt: new Date(Date.now() - 61_000) } });
    await resendEmailOtp(started.pendingToken, mail);
    const second = latestCode();
    assert.notEqual(first, second);
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, first),
      (err: unknown) => err instanceof ApiError && err.message === "That code is incorrect."
    );
    const user = await completeEmailOtp(started.pendingToken, second);
    assert.equal(user.email, signup.email);
  });

  it("returns the same challenge shape for an existing email or phone and does not send a code", async () => {
    const fresh = await startSignupEmailOtp({ ...signup, email: "brand.new.person@gmail.com", phone: "+919000000088" }, mail);
    await User.create({ name: "Taken", email: signup.email, role: "DRIVER", phone: "+919000000099" });
    const takenEmail = await startSignupEmailOtp(signup, mail);
    assert.deepEqual(Object.keys(takenEmail).sort(), Object.keys(fresh).sort());
    assert.equal(takenEmail.kind, "email");
    assert.equal(mailbox.filter((msg) => msg.to === signup.email).length, 0);
    await assert.rejects(
      () => completeEmailOtp(takenEmail.pendingToken, "000000"),
      (err: unknown) => err instanceof ApiError && err.status === 400 && err.message === "That code is incorrect."
    );
    assert.equal(await User.countDocuments({ email: signup.email }), 1);

    await User.deleteMany({});
    await User.create({ name: "Phone", email: "other.person@gmail.com", role: "DRIVER", phone: signup.phone });
    const takenPhone = await startSignupEmailOtp({ ...signup, email: "fresh.person@gmail.com" }, mail);
    assert.equal(takenPhone.kind, "email");
    assert.equal(mailbox.filter((msg) => msg.to === "fresh.person@gmail.com").length, 0);
    assert.equal(await User.countDocuments({ email: "fresh.person@gmail.com" }), 0);
  });

  it("rejects a phone that is taken by the time the code is verified", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    await User.create({ name: "Racer", email: "racer@gmail.com", role: "DRIVER", phone: signup.phone });
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, latestCode()),
      (err: unknown) => err instanceof ApiError && err.status === 400 && /couldn't complete signup/i.test(err.message)
    );
    assert.equal(await User.countDocuments({ email: signup.email }), 0);
  });

  it("keeps the wrong-guess count when a resend fails before the new code is stored", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    await assert.rejects(() => completeEmailOtp(started.pendingToken, "111111"));
    await EmailOtpPending.updateMany({}, { $set: { sentAt: new Date(Date.now() - 61_000) } });
    await assert.rejects(() =>
      resendEmailOtp(started.pendingToken, {
        ...mail,
        send: async () => {
          throw new Error("down");
        },
      })
    );
    const pending = await EmailOtpPending.findOne({ email: signup.email });
    assert.equal(pending?.attempts, 1);
    const user = await completeEmailOtp(started.pendingToken, latestCode());
    assert.equal(user.email, signup.email);
  });

  it("stops accepting codes after too many attempts", async () => {
    const started = await startSignupEmailOtp(signup, mail);
    const code = latestCode();
    for (let i = 0; i < 4; i += 1) {
      await assert.rejects(() => completeEmailOtp(started.pendingToken, "111111"));
    }
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, "111111"),
      (err: unknown) => err instanceof ApiError && /too many/i.test(err.message)
    );
    await assert.rejects(() => completeEmailOtp(started.pendingToken, code));
    assert.equal(await User.countDocuments({}), 0);
  });

  it("returns the public 503 when Resend rejects a signup recipient and logs only the safe category", async () => {
    const failures: {
      requestId: string;
      stage: string;
      provider: string;
      providerStatus: number | null;
      category: string;
      config: { resendKey: boolean; emailFrom: boolean; sandboxSender: boolean; smtp: boolean };
    }[] = [];
    await assert.rejects(
      () =>
        startSignupEmailOtp(signup, {
          isProd: true,
          requestId: "req-signup-503",
          cfg: {
            SMTP_HOST: "",
            SMTP_PORT: 0,
            SMTP_USER: "",
            SMTP_PASS: "",
            RESEND_API_KEY: "re_test_secret_should_never_appear",
            EMAIL_FROM: "Place2Park <onboarding@resend.dev>",
          },
          logFailure: (event) => failures.push(event),
          fetch: async () =>
            ({
              ok: false,
              status: 403,
              json: async () => ({
                name: "validation_error",
                message:
                  "You can only send testing emails to your own email address (owner@gmail.com). To send emails to other recipients, please verify a domain.",
              }),
            }) as unknown as globalThis.Response,
        }),
      (err: unknown) =>
        err instanceof ApiError &&
        err.status === 503 &&
        err.message === "We couldn't send the verification code. Try again shortly."
    );
    assert.equal(await User.countDocuments({ email: signup.email }), 0);
    assert.equal(await EmailOtpPending.countDocuments({}), 0);
    assert.equal(failures.length, 1);
    assert.equal(failures[0]?.requestId, "req-signup-503");
    assert.equal(failures[0]?.stage, "provider");
    assert.equal(failures[0]?.provider, "resend");
    assert.equal(failures[0]?.providerStatus, 403);
    assert.equal(failures[0]?.category, "sandbox_recipient");
    assert.deepEqual(failures[0]?.config, {
      resendKey: true,
      emailFrom: true,
      sandboxSender: true,
      smtp: false,
    });
    assert.doesNotMatch(JSON.stringify(failures), /owner@gmail.com|GoodPass1|654321|re_test_secret|aarav\.mehta/);
  });

  it("delivers a signup code through Resend without putting the code on the challenge", async () => {
    let posted = "";
    let url = "";
    const started = await startSignupEmailOtp(signup, {
      isProd: true,
      cfg: {
        SMTP_HOST: "",
        SMTP_PORT: 0,
        SMTP_USER: "",
        SMTP_PASS: "",
        RESEND_API_KEY: "re_test_secret_should_never_appear",
        EMAIL_FROM: "Place2Park <hello@place2park.app>",
      },
      fetch: async (target, init) => {
        url = target;
        posted = String(init?.body ?? "");
        return { ok: true, status: 200, json: async () => ({ id: "msg_signup" }) } as unknown as globalThis.Response;
      },
    });
    const code = posted.match(/\b(\d{6})\b/)?.[1];
    assert.ok(code);
    assert.equal(url, "https://api.resend.com/emails");
    assert.match(posted, /hello@place2park.app/);
    assert.equal(JSON.stringify(started).includes(code!), false);
    assert.equal(await User.countDocuments({}), 0);
    const user = await completeEmailOtp(started.pendingToken, code!);
    assert.equal(user.email, signup.email);
  });
});

describe("Google email verification", () => {
  it("holds a new Google user until the email code matches", async () => {
    const started = await beginGoogleSignIn(
      { sub: "google-new", email: "new.driver@gmail.com", emailVerified: true, name: "New Driver" },
      mail
    );
    assert.equal(started.kind, "email");
    if (started.kind !== "email") return;
    const code = latestCode();
    assert.equal(JSON.stringify(started).includes(code), false);
    assert.equal(await User.countDocuments({}), 0);
    const blocked = await runAuth(started.pendingToken);
    assert.ok(blocked.err instanceof ApiError && blocked.err.status === 401);
    assert.equal(blocked.req.userId, undefined);

    const user = await completeEmailOtp(started.pendingToken, code);
    assert.equal(user.role, "DRIVER");
    assert.equal(user.email, "new.driver@gmail.com");
    const access = await runAuth(signToken(String(user._id), 0));
    assert.equal(access.req.userId, String(user._id));
  });

  it("signs in an existing Google user and keeps their booking and listing", async () => {
    const existing = await User.create({
      name: "Host",
      email: "host.person@gmail.com",
      googleId: "google-host",
      role: "HOST",
      phoneVerified: false,
    });
    const space = await ParkingSpace.create({
      hostId: existing._id,
      title: "Kept driveway",
      address: "Andheri West",
      area: "Andheri West",
      city: "Mumbai",
      location: { type: "Point", coordinates: [72.8296, 19.1364] },
      pricePerHour: 5000,
    });
    const booking = await Booking.create({
      code: "KEEPCODE1",
      userId: existing._id,
      spaceId: space._id,
      hostId: existing._id,
      start: new Date("2026-11-01T10:00:00.000Z"),
      end: new Date("2026-11-01T12:00:00.000Z"),
      durationMins: 120,
      accessCode: "4455",
      baseAmount: 10000,
      serviceFee: 1000,
      totalAmount: 11000,
      platformFee: 1000,
      hostEarning: 10000,
    });
    const started = await beginGoogleSignIn(
      { sub: "google-host", email: "host.person@gmail.com", emailVerified: true },
      mail
    );
    assert.equal(started.kind, "session");
    if (started.kind !== "session") return;
    assert.equal(String(started.user._id), String(existing._id));
    assert.equal(started.user.role, "HOST");
    assert.equal(mailbox.length, 0);
    assert.equal(String((await Booking.findById(booking._id))?.userId), String(existing._id));
    assert.equal(String((await ParkingSpace.findById(space._id))?.hostId), String(existing._id));
    assert.equal(await User.countDocuments({}), 1);
  });

  it("does not link Google onto an email/password account", async () => {
    const existing = await User.create({
      name: "Password",
      email: "password.person@gmail.com",
      passwordHash: await bcrypt.hash("GoodPass1!", 4),
      role: "DRIVER",
    });
    await assert.rejects(
      () =>
        beginGoogleSignIn(
          { sub: "google-other", email: "password.person@gmail.com", emailVerified: true },
          mail
        ),
      (err: unknown) => err instanceof ApiError && err.status === 409
    );
    const again = await User.findById(existing._id).select("+googleId +passwordHash");
    assert.equal(again?.googleId ?? null, null);
    assert.ok(again?.passwordHash);
    assert.equal(again?.role, "DRIVER");
    assert.equal(mailbox.length, 0);
  });

  it("rejects an expired pending verification", async () => {
    const started = await beginGoogleSignIn(
      { sub: "google-new", email: "new.driver@gmail.com", emailVerified: true, name: "New Driver" },
      mail
    );
    if (started.kind !== "email") throw new Error("expected email challenge");
    await EmailOtpPending.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    await assert.rejects(
      () => completeEmailOtp(started.pendingToken, latestCode()),
      (err: unknown) => err instanceof ApiError && /expired/i.test(err.message)
    );
    assert.equal(await User.countDocuments({}), 0);
  });

  it("rejects a purpose token on protected routes", async () => {
    const user = await User.create({ name: "Session", email: "session.person@gmail.com", role: "DRIVER" });
    const crafted = jwt.sign({ sub: String(user._id), ver: 0, purpose: "email-otp" }, env.JWT_SECRET, {
      algorithm: "HS256",
    });
    const access = await runAuth(crafted);
    assert.ok(access.err instanceof ApiError && access.err.status === 401);
    assert.equal(access.req.userId, undefined);
  });
});
