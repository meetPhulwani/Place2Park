import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { User } from "../models/index.js";
import { ApiError } from "../middleware/error.js";
import { authenticate, signToken, type AuthedRequest } from "../middleware/auth.js";
import { env } from "../config/env.js";
import { resetPassword } from "../controllers/auth.controller.js";
import { resolveGoogleAccountLink } from "./auth-accounts.js";
import type { Request, Response } from "express";

let memory: MongoMemoryServer;
const prevJwt = env.JWT_SECRET;

function jsonRes() {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

async function runAuth(token: string) {
  const req = { headers: { authorization: `Bearer ${token}` } } as Request;
  let err: unknown;
  await authenticate(req, {} as Response, (e) => {
    err = e;
  });
  return { req: req as AuthedRequest, err };
}

before(async () => {
  env.JWT_SECRET = "auth-security-test-secret-which-is-32-chars";
  memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
  await mongoose.connect(memory.getUri("parkly-auth-security"));
});

after(async () => {
  env.JWT_SECRET = prevJwt;
  await mongoose.disconnect();
  await memory.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
});

describe("session revocation after password reset", () => {
  it("rejects a JWT issued before the password reset", async () => {
    const user = await User.create({
      name: "Reset User",
      email: "reset@parkly.test",
      passwordHash: await bcrypt.hash("old-password", 4),
      role: "DRIVER",
    });
    const oldToken = signToken(String(user._id), user.tokenVersion ?? 0);
    const ok = await runAuth(oldToken);
    assert.equal(ok.err, undefined);
    assert.equal(ok.req.userId, String(user._id));

    const raw = crypto.randomBytes(24).toString("hex");
    const hashed = crypto.createHash("sha256").update(raw).digest("hex");
    await User.updateOne(
      { _id: user._id },
      { $set: { resetToken: hashed, resetTokenExpires: new Date(Date.now() + 10 * 60000) } }
    );
    await resetPassword({ body: { token: raw, password: "new-password-1" } } as Request, jsonRes());

    const after = await runAuth(oldToken);
    assert.ok(after.err instanceof ApiError && after.err.status === 401);
  });
});

describe("Google account linking", () => {
  it("does not attach Google to an existing password account with the same email", () => {
    const decision = resolveGoogleAccountLink(
      { email: "shared@parkly.test", googleId: "", passwordHash: "hashed" },
      { sub: "google-sub-1", email: "shared@parkly.test" }
    );
    assert.equal(decision.action, "conflict");
  });

  it("logs in when the Google subject already belongs to the account", () => {
    const decision = resolveGoogleAccountLink(
      { email: "same@parkly.test", googleId: "google-sub-1", passwordHash: "" },
      { sub: "google-sub-1", email: "same@parkly.test" }
    );
    assert.equal(decision.action, "login");
  });

  it("creates a new user when no local account exists", () => {
    const decision = resolveGoogleAccountLink(null, { sub: "google-sub-2", email: "new@parkly.test" });
    assert.equal(decision.action, "create");
  });
});
