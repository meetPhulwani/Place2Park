import assert from "node:assert/strict";
import http from "node:http";
import bcrypt from "bcryptjs";
import { after, before, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { signToken } from "../middleware/auth.js";
import { AdminAccount, AdminConsoleSession, AdminLoginChallenge, ConsoleAudit, User } from "../models/index.js";
import { confirmDelegatedAdmin, createDelegatedAdmin, provisionSuperAdmin, setConsoleMailDeps } from "./admin-auth.js";
import { beginGoogleSignIn, startSignupEmailOtp } from "./email-otp.js";
import { resetRateLimitStoresForTests } from "../utils/rate-limit.js";
import { totpCode } from "../utils/totp.js";
import type { AddressInfo } from "node:net";

let memory: MongoMemoryServer;
let server: http.Server;
let port = 0;
let lastMail = "";

const owner = { email: "owner@place2park.me", password: "Console1!ok", answer: "blue house", secret: "" };

function mailCode() {
  return lastMail.match(/\b(\d{6})\b/)?.[1] ?? "";
}

function request(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; body: string; cookies: string[] }>((resolve, reject) => {
    const payload = body === undefined ? "" : JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const raw = response.headers["set-cookie"];
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            cookies: Array.isArray(raw) ? raw : raw ? [raw] : [],
          });
        });
      }
    );
    req.on("error", reject);
    req.end(payload);
  });
}

function jar(cookies: string[]) {
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function cookieValue(cookies: string[], name: string) {
  const row = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return row ? decodeURIComponent(row.split(";")[0].slice(name.length + 1)) : "";
}

async function login(email: string, password: string, answer: string, secret: string) {
  resetRateLimitStoresForTests();
  const started = await request("POST", "/api/console/auth/start", { email, password });
  assert.equal(started.status, 200);
  const step = cookieValue(started.cookies, "p2p_adm_step");
  const otp = await request("POST", "/api/console/auth/otp", { code: mailCode() }, { cookie: `p2p_adm_step=${step}` });
  assert.equal(otp.status, 200);
  const question = await request("POST", "/api/console/auth/question", { answer }, { cookie: `p2p_adm_step=${step}` });
  assert.equal(question.status, 200);
  const totp = await request("POST", "/api/console/auth/totp", { code: totpCode(secret) }, { cookie: `p2p_adm_step=${step}` });
  assert.equal(totp.status, 200);
  return totp.cookies;
}

before(async () => {
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-console"));
  setConsoleMailDeps({ send: async (msg) => { lastMail = msg.text; } });
  owner.secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
  await provisionSuperAdmin({
    email: owner.email,
    name: "Owner",
    password: owner.password,
    questionId: "first-school",
    answer: owner.answer,
    totpCode: totpCode(owner.secret),
    totpSecret: owner.secret,
  });
  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  setConsoleMailDeps(undefined);
  server.close();
  await mongoose.disconnect();
  await memory.stop();
});

describe("isolated admin console", () => {
  it("rejects discovery, user sessions, and admin credentials on the user API", async () => {
    const hidden = await request("GET", "/api/console/metrics");
    assert.equal(hidden.status, 404);
    const old = await request("GET", "/api/admin/metrics");
    assert.equal(old.status, 404);
    const user = await User.create({
      name: "Driver",
      email: "driver@place2park.me",
      passwordHash: await bcrypt.hash("Driver1!ok", 10),
      role: "DRIVER",
    });
    const token = signToken(String(user._id), user.tokenVersion ?? 0);
    const crossed = await request("GET", "/api/console/users", undefined, { authorization: `Bearer ${token}` });
    assert.equal(crossed.status, 404);
    const userLogin = await request("POST", "/api/console/auth/start", { email: "driver@place2park.me", password: "Driver1!ok" });
    assert.equal(userLogin.status, 200);
    assert.equal(cookieValue(userLogin.cookies, "p2p_adm"), "");
    const adminOnUser = await request("POST", "/api/auth/login", { email: owner.email, password: owner.password });
    assert.equal(adminOnUser.status, 401);
    assert.equal(adminOnUser.body.includes("token"), false);
    const cookies = await login(owner.email, owner.password, owner.answer, owner.secret);
    const me = await request("GET", "/api/auth/me", undefined, { cookie: jar(cookies) });
    assert.equal(me.status, 401);
  });

  it("rejects a bad password, an expired code, reuse, and brute force", async () => {
    resetRateLimitStoresForTests();
    const bad = await request("POST", "/api/console/auth/start", { email: owner.email, password: "nope" });
    assert.equal(bad.status, 200);
    const missing = await request("POST", "/api/console/auth/start", { email: "missing@place2park.me", password: owner.password });
    assert.equal(missing.status, 200);
    assert.equal(bad.body, missing.body);
    assert.equal(cookieValue(bad.cookies, "p2p_adm"), "");
    const started = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
    const step = cookieValue(started.cookies, "p2p_adm_step");
    const code = mailCode();
    const latest = await AdminLoginChallenge.findOne().sort({ createdAt: -1 });
    latest!.otpExpiresAt = new Date(Date.now() - 1000);
    await latest!.save();
    const expired = await request("POST", "/api/console/auth/otp", { code }, { cookie: `p2p_adm_step=${step}` });
    assert.equal(expired.status, 401);
    await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
    const fresh = cookieValue((await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password })).cookies, "p2p_adm_step");
    const first = await request("POST", "/api/console/auth/otp", { code: mailCode() }, { cookie: `p2p_adm_step=${fresh}` });
    assert.equal(first.status, 200);
    const reuse = await request("POST", "/api/console/auth/otp", { code: mailCode() }, { cookie: `p2p_adm_step=${fresh}` });
    assert.equal(reuse.status, 401);
    const again = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
    const bruteStep = cookieValue(again.cookies, "p2p_adm_step");
    const real = mailCode();
    for (let i = 0; i < 5; i += 1) {
      await request("POST", "/api/console/auth/otp", { code: "000000" }, { cookie: `p2p_adm_step=${bruteStep}` });
    }
    const blocked = await request("POST", "/api/console/auth/otp", { code: real }, { cookie: `p2p_adm_step=${bruteStep}` });
    assert.equal(blocked.status, 401);
  });

  it("blocks security-answer brute force and records audits without secrets", async () => {
    resetRateLimitStoresForTests();
    const started = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
    assert.equal(started.status, 200);
    const step = cookieValue(started.cookies, "p2p_adm_step");
    const otp = await request("POST", "/api/console/auth/otp", { code: mailCode() }, { cookie: `p2p_adm_step=${step}` });
    assert.equal(otp.status, 200);
    for (let i = 0; i < 5; i += 1) {
      await request("POST", "/api/console/auth/question", { answer: "wrong answer" }, { cookie: `p2p_adm_step=${step}` });
    }
    const blocked = await request("POST", "/api/console/auth/question", { answer: owner.answer }, { cookie: `p2p_adm_step=${step}` });
    assert.equal(blocked.status, 401);
    const audits = await ConsoleAudit.find().lean();
    const dumped = JSON.stringify(audits);
    assert.equal(dumped.includes(owner.password), false);
    assert.equal(dumped.includes(owner.answer), false);
    assert.ok(audits.some((row) => row.action === "login.password" && row.outcome === "FAILURE"));
    await AdminAccount.updateOne({ email: owner.email }, { $set: { lockedUntil: null } });
  });

  it("rotates the step cookie, rejects csrf, expired and revoked sessions, and inactive admins", async () => {
    resetRateLimitStoresForTests();
    const planted = "planted-step-token";
    const started = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password }, { cookie: `p2p_adm_step=${planted}` });
    const step = cookieValue(started.cookies, "p2p_adm_step");
    assert.notEqual(step, planted);
    const cookies = await login(owner.email, owner.password, owner.answer, owner.secret);
    const session = jar(cookies);
    const csrf = cookieValue(cookies, "p2p_adm_csrf");
    const blocked = await request("POST", "/api/console/auth/logout", {}, { cookie: session });
    assert.equal(blocked.status, 403);
    await AdminConsoleSession.updateMany({ revokedAt: null }, { $set: { absoluteExpiresAt: new Date(Date.now() - 1000) } });
    const expired = await request("GET", "/api/console/auth/session", undefined, { cookie: session });
    assert.equal(expired.status, 404);
    const live = await login(owner.email, owner.password, owner.answer, owner.secret);
    await request("POST", "/api/console/auth/logout", {}, { cookie: jar(live), "x-csrf-token": cookieValue(live, "p2p_adm_csrf") });
    const revoked = await request("GET", "/api/console/auth/session", undefined, { cookie: jar(live) });
    assert.equal(revoked.status, 404);
    const active = await login(owner.email, owner.password, owner.answer, owner.secret);
    await AdminAccount.updateOne({ email: owner.email }, { $set: { status: "DISABLED" } });
    const inactive = await request("GET", "/api/console/auth/session", undefined, { cookie: jar(active) });
    assert.equal(inactive.status, 404);
    await AdminAccount.updateOne({ email: owner.email }, { $set: { status: "ACTIVE" } });
    assert.ok(csrf);
    const success = await ConsoleAudit.findOne({ action: "login.success", outcome: "SUCCESS" });
    assert.ok(success);
  });

  it("keeps support away from finance and blocks privilege escalation", async () => {
    const ownerDoc = await AdminAccount.findOne({ email: owner.email });
    const created = await createDelegatedAdmin("SUPER_ADMIN", {
      email: "support@place2park.me",
      name: "Support",
      password: "Support1!ok",
      role: "SUPPORT",
      questionId: "city-born",
      answer: "pune",
    }, { adminAccount: { id: String(ownerDoc?._id) } } as never);
    const secret = new URL(created.uri).searchParams.get("secret") ?? "";
    await confirmDelegatedAdmin("SUPER_ADMIN", created.id, totpCode(secret), { adminAccount: { id: String(ownerDoc?._id) } } as never);
    const cookies = await login("support@place2park.me", "Support1!ok", "pune", secret);
    const headers = { cookie: jar(cookies), "x-csrf-token": cookieValue(cookies, "p2p_adm_csrf") };
    const payout = await request("POST", "/api/console/payouts/507f1f77bcf86cd799439011/approve", {}, headers);
    assert.equal(payout.status, 403);
    const escalate = await request("POST", `/api/console/staff/${created.id}/role`, { role: "SUPER_ADMIN" }, headers);
    assert.equal(escalate.status, 403);
    const ownerCookies = await login(owner.email, owner.password, owner.answer, owner.secret);
    const ownerHeaders = { cookie: jar(ownerCookies), "x-csrf-token": cookieValue(ownerCookies, "p2p_adm_csrf") };
    const second = await request("POST", "/api/console/staff", {
      email: "second-owner@place2park.me",
      name: "Second",
      password: "Second1!ok",
      role: "SUPER_ADMIN",
      questionId: "first-car",
      answer: "ambassador",
    }, ownerHeaders);
    assert.equal(second.status, 400);
    await assert.rejects(
      () => beginGoogleSignIn({ sub: "google-admin", email: owner.email, emailVerified: true, name: "Owner" }),
      (err: unknown) => err instanceof Error && "status" in err && (err as { status: number }).status === 401
    );
    await startSignupEmailOtp({
      name: "Owner Copy",
      email: owner.email,
      password: "Console1!ok",
      role: "DRIVER",
      phone: "9876543210",
    }, { send: async (msg) => { lastMail = msg.text; } });
    assert.equal(await User.exists({ email: owner.email }), null);
  });

  it("uses one response for mail failure, an unknown account, and an inactive account", async () => {
    resetRateLimitStoresForTests();
    const wrong = await request("POST", "/api/console/auth/start", { email: owner.email, password: "nope" });
    const unknown = await request("POST", "/api/console/auth/start", { email: "nobody@place2park.me", password: owner.password });
    assert.equal(wrong.status, 200);
    assert.equal(unknown.body, wrong.body);
    setConsoleMailDeps({ send: async () => { throw new Error("mailbox down"); } });
    try {
      const failed = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
      assert.equal(failed.status, 200);
      assert.equal(failed.body, wrong.body);
      assert.equal(cookieValue(failed.cookies, "p2p_adm"), "");
      const otp = await request("POST", "/api/console/auth/otp", { code: "000000" }, { cookie: `p2p_adm_step=${cookieValue(failed.cookies, "p2p_adm_step")}` });
      assert.equal(otp.status, 401);
      assert.equal(cookieValue(otp.cookies, "p2p_adm"), "");
    } finally {
      setConsoleMailDeps({ send: async (msg) => { lastMail = msg.text; } });
    }
    await AdminAccount.updateOne({ email: owner.email }, { $set: { status: "DISABLED" } });
    const inactive = await request("POST", "/api/console/auth/start", { email: owner.email, password: owner.password });
    await AdminAccount.updateOne({ email: owner.email }, { $set: { status: "ACTIVE" } });
    assert.equal(inactive.status, 200);
    assert.equal(inactive.body, wrong.body);
  });
});
