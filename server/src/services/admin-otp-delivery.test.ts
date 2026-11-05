import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { after, before, describe, it } from "node:test";
import type { Request, Response } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { AdminAccount, AdminConsoleSession, AdminLoginChallenge, User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { start } from "../controllers/console-auth.controller.js";
import {
  provisionSuperAdmin,
  setConsoleMailDeps,
  startAdminLogin,
  verifyAdminOtp,
} from "./admin-auth.js";
import { sha256 } from "../utils/admin-secret.js";
import { totpCode } from "../utils/totp.js";
import type { OutboundMailDeps } from "./email.js";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const PASSWORD = "Console1!ok";
const KEY = "re_test_secret_should_never_appear";

const readyMail = {
  SMTP_HOST: "",
  SMTP_PORT: 0,
  SMTP_USER: "",
  SMTP_PASS: "",
  RESEND_API_KEY: KEY,
  EMAIL_FROM: "Place2Park <hello@place2park.me>",
};

function req(): Request {
  return { ip: "203.0.113.10", headers: { "user-agent": "otp-test" } } as Request;
}

function watchLogs() {
  const info = console.info;
  const error = console.error;
  const warn = console.warn;
  const records: unknown[][] = [];
  console.info = (...args: unknown[]) => records.push(args);
  console.error = (...args: unknown[]) => records.push(args);
  console.warn = (...args: unknown[]) => records.push(args);
  return {
    text() {
      return records
        .map((args) => args.map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "))
        .join("\n");
    },
    restore() {
      console.info = info;
      console.error = error;
      console.warn = warn;
    },
  };
}

function postedCode(body: string) {
  return body.match(/\b(\d{6})\b/)?.[1] ?? "";
}

async function addAdmin(email: string, passwordHash: string) {
  await AdminAccount.create({
    email,
    name: "Owner",
    passwordHash,
    role: "FINANCE",
    status: "ACTIVE",
    questionId: "first-school",
    answerHash: await bcrypt.hash("blue house", 12),
    totpSecret: "sealed-unused",
  });
}

describe("admin OTP delivery", { concurrency: 1 }, () => {
  let memory: MongoMemoryServer;

  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
    await mongoose.connect(memory.getUri("parkly-admin-otp"));
    const host = mongoose.connection.host;
    if (host !== "127.0.0.1" && host !== "localhost") {
      throw new Error("Refusing to run OTP tests against a non-local database.");
    }
    const existing = await AdminAccount.countDocuments({ role: "SUPER_ADMIN" });
    if (existing) throw new Error(`Local test database already has ${existing} super admin records.`);
    await provisionSuperAdmin({
      email: "delivery@place2park.me",
      name: "Owner",
      password: PASSWORD,
      questionId: "first-school",
      answer: "blue house",
      totpCode: totpCode(SECRET),
      totpSecret: SECRET,
    });
    const hash = await bcrypt.hash(PASSWORD, 12);
    await addAdmin("failure@place2park.me", hash);
    await addAdmin("blocked@parkly.dev", hash);
    await addAdmin("generic@place2park.me", hash);
    await addAdmin("crlf@place2park.me", await bcrypt.hash(`${PASSWORD}\r\n`, 12));
  });

  after(async () => {
    setConsoleMailDeps(undefined);
    await mongoose.disconnect();
    await memory.stop();
  });

  it("sends a hashed five-minute code through Resend and does not open a session", async () => {
    let url = "";
    let body = "";
    const logs = watchLogs();
    try {
      const started = await startAdminLogin({ email: "delivery@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch: async (target, init) => {
          url = target;
          body = String(init?.body ?? "");
          return { ok: true, status: 200, json: async () => ({ id: "msg_admin_otp" }) } as unknown as globalThis.Response;
        },
      });
      const code = postedCode(body);
      const account = await AdminAccount.findOne({ email: "delivery@place2park.me" });
      const challenge = await AdminLoginChallenge.findOne({ adminId: account?._id });
      const ttl = (challenge?.otpExpiresAt?.getTime() ?? 0) - Date.now();
      assert.equal(url, "https://api.resend.com/emails");
      assert.match(body, /hello@place2park.me/);
      assert.match(body, /delivery@place2park\.me/);
      assert.equal(started.stage, "otp");
      assert.equal(JSON.stringify(started).includes(code), false);
      assert.equal(challenge?.otpHash, sha256(`${challenge?.tokenHash}:${code}`));
      assert.notEqual(challenge?.otpHash, code);
      assert.ok(ttl > 4 * 60 * 1000 && ttl <= 5 * 60 * 1000);
      assert.equal(await AdminConsoleSession.countDocuments({ adminId: account?._id }), 0);
      assert.match(logs.text(), /"stage":"accepted"/);
      assert.match(logs.text(), /"providerStatus":200/);
      assert.equal(logs.text().includes(code), false);
      assert.equal(logs.text().includes(KEY), false);
      const first = await verifyAdminOtp(started.token, code, req());
      assert.equal(first.stage, "question");
      await assert.rejects(() => verifyAdminOtp(started.token, code, req()), (err: unknown) => err instanceof ApiError);
    } finally {
      logs.restore();
    }
  });

  it("keeps the public OTP response and withholds a session when Resend rejects the message", async () => {
    let calls = 0;
    const logs = watchLogs();
    try {
      const started = await startAdminLogin({ email: "failure@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch: async () => {
          calls += 1;
          return {
            ok: false,
            status: 403,
            json: async () => ({
              name: "validation_error",
              message: "You can only send testing emails to your own email address (owner@gmail.com).",
            }),
          } as unknown as globalThis.Response;
        },
      });
      const account = await AdminAccount.findOne({ email: "failure@place2park.me" });
      const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(started.token) });
      assert.equal(calls, 1);
      assert.equal(started.stage, "otp");
      assert.equal(challenge?.decoy, true);
      assert.equal(await AdminConsoleSession.countDocuments({ adminId: account?._id }), 0);
      assert.match(logs.text(), /"category":"sandbox_recipient"/);
      assert.match(logs.text(), /"providerStatus":403/);
      assert.equal(logs.text().includes(KEY), false);
      assert.equal(logs.text().includes("owner@gmail.com"), false);
      await assert.rejects(() => verifyAdminOtp(started.token, "000000", req()), (err: unknown) => err instanceof ApiError);
    } finally {
      logs.restore();
    }
  });

  it("does not call Resend for a missing provider, an invalid sender, or a placeholder recipient", async () => {
    let calls = 0;
    const fetch: OutboundMailDeps["fetch"] = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({}) } as unknown as globalThis.Response;
    };
    const logs = watchLogs();
    try {
      const missing = await startAdminLogin({ email: "delivery@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: { SMTP_HOST: "", SMTP_PORT: 0, SMTP_USER: "", SMTP_PASS: "", EMAIL_FROM: "", RESEND_API_KEY: "" },
        fetch,
      });
      const invalidSender = await startAdminLogin({ email: "delivery@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: { ...readyMail, EMAIL_FROM: "Admin <admin@parkly.dev>" },
        fetch,
      });
      const blocked = await startAdminLogin({ email: "blocked@parkly.dev", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch,
      });
      assert.equal(calls, 0);
      assert.equal(missing.stage, "otp");
      assert.equal(invalidSender.stage, "otp");
      assert.equal(blocked.stage, "otp");
      assert.match(logs.text(), /"category":"missing_provider"/);
      assert.match(logs.text(), /"category":"sender_disabled"/);
      assert.match(logs.text(), /"category":"undeliverable_recipient"/);
      assert.equal(await AdminConsoleSession.countDocuments({}), 0);
      for (const started of [missing, invalidSender, blocked]) {
        const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(started.token) });
        assert.equal(challenge?.decoy, true);
      }
    } finally {
      logs.restore();
    }
  });

  it("accepts a password saved with a Windows line ending and still sends the code", async () => {
    let calls = 0;
    const started = await startAdminLogin({ email: "crlf@place2park.me", password: PASSWORD }, req(), {
      isProd: true,
      cfg: readyMail,
      fetch: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => ({ id: "msg_crlf" }) } as unknown as globalThis.Response;
      },
    });
    assert.equal(calls, 1);
    assert.equal(started.stage, "otp");
    const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(started.token) });
    assert.equal(challenge?.decoy, false);
  });

  it("returns one generic response for a wrong password and a delivery failure", async () => {
    const logs = watchLogs();
    const capture = () => {
      const cookies: Record<string, string> = {};
      let body: unknown;
      const res = {
        cookie(name: string, value: string) {
          cookies[name] = value;
        },
        json(payload: unknown) {
          body = payload;
        },
      } as unknown as Response;
      return { cookies, body: () => body, res };
    };
    try {
      setConsoleMailDeps({ isProd: true, cfg: readyMail, fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as globalThis.Response });
      const wrong = capture();
      await start({ body: { email: "generic@place2park.me", password: "Wrong1!pass" }, ip: "203.0.113.10", headers: { "user-agent": "otp-test" } } as Request, wrong.res);
      setConsoleMailDeps({
        isProd: true,
        cfg: readyMail,
        fetch: async () => ({ ok: false, status: 422, json: async () => ({ name: "validation_error", message: "invalid" }) }) as unknown as globalThis.Response,
      });
      const failed = capture();
      await start({ body: { email: "generic@place2park.me", password: PASSWORD }, ip: "203.0.113.10", headers: { "user-agent": "otp-test" } } as Request, failed.res);
      assert.equal(JSON.stringify(wrong.body()), JSON.stringify(failed.body()));
      assert.equal(JSON.stringify(wrong.body()), '{"success":true,"data":{"stage":"otp"}}');
      assert.equal(wrong.cookies.p2p_adm, undefined);
      assert.equal(failed.cookies.p2p_adm, undefined);
      assert.equal(typeof wrong.cookies.p2p_adm_step, "string");
      assert.match(logs.text(), /"reason":"password"/);
      assert.match(logs.text(), /"category":"validation_error"/);
    } finally {
      setConsoleMailDeps(undefined);
      logs.restore();
    }
  });

  it("does not email a marketplace ADMIN user when no AdminAccount exists", async () => {
    await User.create({
      name: "Legacy Admin",
      email: "legacy.admin@place2park.me",
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      role: "ADMIN",
    });
    let calls = 0;
    const logs = watchLogs();
    try {
      const started = await startAdminLogin({ email: "legacy.admin@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch: async () => {
          calls += 1;
          return { ok: true, status: 200, json: async () => ({}) } as unknown as globalThis.Response;
        },
      });
      assert.equal(calls, 0);
      assert.equal(started.stage, "otp");
      assert.match(logs.text(), /"reason":"no_account"/);
      assert.equal(logs.text().includes("legacy.admin@place2park.me"), false);
      assert.equal(await AdminAccount.exists({ email: "legacy.admin@place2park.me" }), null);
      assert.equal(await AdminConsoleSession.countDocuments({}), 0);
      const challenge = await AdminLoginChallenge.findOne({ tokenHash: sha256(started.token) });
      assert.equal(challenge?.decoy, true);
    } finally {
      logs.restore();
    }
  });

  it("records inactive and locked accounts without calling Resend", async () => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({}) } as unknown as globalThis.Response;
    };
    const logs = watchLogs();
    try {
      await AdminAccount.updateOne({ email: "failure@place2park.me" }, { $set: { status: "DISABLED", lockedUntil: null } });
      const inactive = await startAdminLogin({ email: "failure@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch,
      });
      await AdminAccount.updateOne(
        { email: "failure@place2park.me" },
        { $set: { status: "ACTIVE", lockedUntil: new Date(Date.now() + 60_000) } }
      );
      const locked = await startAdminLogin({ email: "failure@place2park.me", password: PASSWORD }, req(), {
        isProd: true,
        cfg: readyMail,
        fetch,
      });
      assert.equal(calls, 0);
      assert.equal(inactive.stage, "otp");
      assert.equal(locked.stage, "otp");
      assert.match(logs.text(), /"reason":"inactive"/);
      assert.match(logs.text(), /"reason":"locked"/);
      assert.equal(await AdminConsoleSession.countDocuments({}), 0);
    } finally {
      await AdminAccount.updateOne({ email: "failure@place2park.me" }, { $set: { status: "ACTIVE", lockedUntil: null } });
      logs.restore();
    }
  });
});
