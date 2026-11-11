import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import express from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { createApp } from "../app.js";
import { ConsoleAudit, ConsoleAuditHead, PlatformSetting } from "../models/index.js";
import { verifyConsoleAuditChain, writeConsoleAudit } from "./console-audit.js";
import { resolvePublishState } from "./listings.js";
import { openSecret, reencryptSecret, sealSecret } from "../utils/admin-secret.js";
import { rateLimit } from "../utils/rate-limit.js";
import { MemorySharedCounter } from "../utils/shared-counter.js";
import { errorHandler } from "../middleware/error.js";

describe("shared rate counters", () => {
  it("shares a counter across two stores and expires old hits", async () => {
    const backend = new MemorySharedCounter();
    const first = rateLimit("unit-shared", 2, 2_000, { key: () => "same", counter: backend, failClosed: true });
    const second = rateLimit("unit-shared", 2, 2_000, { key: () => "same", counter: backend, failClosed: true });
    const app = express();
    app.use(first);
    app.post("/a", (_req, res) => res.json({ ok: true }));
    const other = express();
    other.use(second);
    other.post("/b", (_req, res) => res.json({ ok: true }));
    const left = await post(app, "/a");
    const right = await post(other, "/b");
    const blocked = await post(app, "/a");
    assert.equal(left.status, 200);
    assert.equal(right.status, 200);
    assert.equal(blocked.status, 429);
    await new Promise((resolve) => setTimeout(resolve, 2_100));
    const again = await post(app, "/a");
    assert.equal(again.status, 200);
    await backend.increment("console-password:account", 60_000);
    await backend.reset("unit-shared:");
    const kept = await backend.increment("console-password:account", 60_000);
    assert.equal(kept.totalHits, 2);
  });

  it("serializes concurrent increments", async () => {
    const backend = new MemorySharedCounter();
    await Promise.all(Array.from({ length: 20 }, () => backend.increment("burst", 60_000)));
    const last = await backend.increment("burst", 60_000);
    assert.equal(last.totalHits, 21);
  });

  it("fails closed when the shared counter is unavailable", async () => {
    const backend: MemorySharedCounter = Object.create(MemorySharedCounter.prototype);
    backend.increment = async () => {
      throw new Error("redis down");
    };
    const app = express();
    app.use(rateLimit("console-password", 5, 60_000, { key: () => "ip", counter: backend, failClosed: true }));
    app.post("/auth", (_req, res) => res.json({ ok: true }));
    app.use(errorHandler);
    const response = await post(app, "/auth");
    assert.equal(response.status, 503);
    assert.match(response.body, /couldn't complete that step/);
    assert.equal(response.body.includes("redis"), false);
  });
});

describe("stored security records", { concurrency: 1 }, () => {
  let memory: MongoMemoryServer;
  before(async () => {
    memory = await MongoMemoryServer.create({ instance: { launchTimeout: 120000 } });
    await mongoose.connect(memory.getUri("parkly-audit"));
  });
  after(async () => {
    await mongoose.disconnect();
    await memory.stop();
  });

  it("links events and detects tampering or deletion", async () => {
    await writeConsoleAudit({ action: "login.password", outcome: "FAILURE" });
    await writeConsoleAudit({ action: "login.success", outcome: "SUCCESS", adminId: new mongoose.Types.ObjectId().toString() });
    assert.equal((await verifyConsoleAuditChain()).ok, true);
    await assert.rejects(() => ConsoleAudit.updateOne({}, { $set: { action: "changed" } }));
    const row = await ConsoleAudit.findOne({ action: "login.success" });
    await ConsoleAudit.collection.updateOne({ _id: row?._id }, { $set: { action: "changed" } });
    const tampered = await verifyConsoleAuditChain();
    assert.equal(tampered.ok, false);
    await ConsoleAudit.collection.deleteOne({ _id: row?._id });
    const deleted = await verifyConsoleAuditChain();
    assert.equal(deleted.ok, false);
    assert.ok(deleted.problems.some((problem) => problem.includes("sequence") || problem.includes("head") || problem.includes("hash")));
  });

  it("keeps one chain when writes overlap", async () => {
    await assert.rejects(() => ConsoleAudit.deleteMany({}));
    await ConsoleAudit.collection.deleteMany({});
    await ConsoleAuditHead.deleteMany({});
    await Promise.all(Array.from({ length: 6 }, (_item, index) => writeConsoleAudit({ action: `overlap.${index}`, outcome: "SUCCESS" })));
    const check = await verifyConsoleAuditChain();
    assert.equal(check.ok, true, check.problems.join("; "));
    assert.equal(check.count, 6);
  });

  it("appends every event while the head lock is still held", async () => {
    await ConsoleAudit.collection.deleteMany({});
    await ConsoleAuditHead.deleteMany({});
    await ConsoleAuditHead.create({
      _id: "head",
      seq: 0,
      eventHash: "genesis",
      lockedAt: new Date(Date.now() + 60_000),
    });
    await Promise.all(Array.from({ length: 6 }, (_item, index) => writeConsoleAudit({ action: `locked.${index}`, outcome: "SUCCESS" })));
    const check = await verifyConsoleAuditChain();
    assert.equal(check.ok, true, check.problems.join("; "));
    assert.equal(check.count, 6);
    const actions = (await ConsoleAudit.find().select("action").lean()).map((row) => row.action).sort();
    assert.deepEqual(actions, ["locked.0", "locked.1", "locked.2", "locked.3", "locked.4", "locked.5"]);
  });

  it("links both events when two writers choose the same sequence", { timeout: 20_000 }, async () => {
    await ConsoleAudit.collection.deleteMany({});
    await ConsoleAuditHead.deleteMany({});
    const chosen: number[] = [];
    let waiting = 0;
    let openGate: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });
    const beforeInsert = async (seq: number) => {
      chosen.push(seq);
      waiting += 1;
      if (waiting === 2) openGate();
      if (waiting <= 2) await gate;
    };
    await Promise.all([
      writeConsoleAudit({ action: "race.left", outcome: "SUCCESS" }, { beforeInsert }),
      writeConsoleAudit({ action: "race.right", outcome: "SUCCESS" }, { beforeInsert }),
    ]);
    assert.equal(chosen[0], chosen[1]);
    const check = await verifyConsoleAuditChain();
    assert.equal(check.ok, true, check.problems.join("; "));
    assert.equal(check.count, 2);
    const actions = (await ConsoleAudit.find().select("action").lean()).map((row) => row.action).sort();
    assert.deepEqual(actions, ["race.left", "race.right"]);
  });

  it("makes review and the public banner do something", async () => {
    assert.equal((await resolvePublishState(true, "development")).status, "VERIFIED");
    await PlatformSetting.create({ key: "platform", listingsRequireReview: true, maintenanceBanner: "<b>Hello</b> drivers" });
    assert.equal((await resolvePublishState(true, "development")).status, "PENDING_REVIEW");
    const app = createApp();
    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const notice = await fetch(`http://127.0.0.1:${port}/api/platform/notice`);
    const body = await notice.json() as { data: { message: string } };
    assert.equal(body.data.message, "Hello drivers");
    const hidden = await fetch(`http://127.0.0.1:${port}/console.html`);
    assert.equal(hidden.status, 404);
    const admin = await fetch(`http://127.0.0.1:${port}/admin`);
    assert.equal(admin.status, 404);
    server.close();
  });
});

describe("totp key versions", () => {
  it("round-trips, rejects a bad key, and rotates without changing the secret", () => {
    const saved = {
      key: process.env.ADMIN_TOTP_KEY,
      previous: process.env.ADMIN_TOTP_KEY_PREVIOUS,
      version: process.env.ADMIN_TOTP_KEY_VERSION,
    };
    try {
      process.env.ADMIN_TOTP_KEY = "first-totp-key-that-is-long-enough";
      process.env.ADMIN_TOTP_KEY_VERSION = "1";
      const sealed = sealSecret("JBSWY3DPEHPK3PXP");
      assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
      assert.throws(() => openSecret(`${sealed.slice(0, 8)}AAAA${sealed.slice(12)}`));
      process.env.ADMIN_TOTP_KEY_PREVIOUS = "first-totp-key-that-is-long-enough";
      process.env.ADMIN_TOTP_KEY = "second-totp-key-that-is-long-enough";
      process.env.ADMIN_TOTP_KEY_VERSION = "2";
      assert.equal(openSecret(sealed), "JBSWY3DPEHPK3PXP");
      const rotated = reencryptSecret(sealed);
      assert.equal(rotated.startsWith("v2."), true);
      assert.equal(openSecret(rotated), "JBSWY3DPEHPK3PXP");
    } finally {
      if (saved.key === undefined) delete process.env.ADMIN_TOTP_KEY;
      else process.env.ADMIN_TOTP_KEY = saved.key;
      if (saved.previous === undefined) delete process.env.ADMIN_TOTP_KEY_PREVIOUS;
      else process.env.ADMIN_TOTP_KEY_PREVIOUS = saved.previous;
      if (saved.version === undefined) delete process.env.ADMIN_TOTP_KEY_VERSION;
      else process.env.ADMIN_TOTP_KEY_VERSION = saved.version;
    }
  });
});

describe("console hosting", () => {
  it("keeps the console bundle off the public hosting output", () => {
    const vercel = readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8");
    assert.match(vercel, /"outputDirectory": "client\/dist"/);
    assert.equal(vercel.includes("dist-console"), false);
  });
});

function post(app: express.Express, path: string) {
  const server = http.createServer(app);
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port;
      const req = http.request({ hostname: "127.0.0.1", port, path, method: "POST" }, (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          server.close();
          resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
        });
      });
      req.on("error", reject);
      req.end();
    });
  });
}
