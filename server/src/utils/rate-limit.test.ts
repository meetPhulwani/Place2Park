import assert from "node:assert/strict";
import http from "node:http";
import { readFileSync } from "node:fs";
import { once } from "node:events";
import express from "express";
import { describe, it, beforeEach } from "node:test";
import {
  BOOKING_RATE_LIMIT,
  BOOKING_RATE_WINDOW_MS,
  PAYMENT_ORDER_LIMIT,
  PAYMENT_ORDER_WINDOW_MS,
  UnavailableRateLimitStore,
  clientAddress,
  emailKey,
  positiveIntEnv,
  rateLimit,
  rateLimitHit,
  resetRateLimitStore,
} from "./rate-limit.js";

describe("booking rate limiter", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("keeps the production booking limit at 10 requests per 10 minutes", () => {
    assert.equal(BOOKING_RATE_LIMIT, 10);
    assert.equal(BOOKING_RATE_WINDOW_MS, 10 * 60_000);
  });

  it("allows 10 hits then denies the 11th in the same window", () => {
    for (let i = 0; i < BOOKING_RATE_LIMIT; i++) {
      assert.equal(rateLimitHit("booking:driver", BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS), true);
    }
    assert.equal(rateLimitHit("booking:driver", BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS), false);
  });

  it("resets so a later test run does not inherit prior hits", () => {
    for (let i = 0; i < BOOKING_RATE_LIMIT; i++) {
      rateLimitHit("booking:driver", BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS);
    }
    resetRateLimitStore();
    assert.equal(rateLimitHit("booking:driver", BOOKING_RATE_LIMIT, BOOKING_RATE_WINDOW_MS), true);
  });

  it("keys authenticated booking requests by user id, not IP", async () => {
    const mw = rateLimit("booking", 2, 60_000);
    const first = await invoke(mw, { userId: "driver-1", ip: "1.1.1.1" });
    const second = await invoke(mw, { userId: "driver-1", ip: "8.8.8.8" });
    const third = await invoke(mw, { userId: "driver-1", ip: "9.9.9.9" });
    const other = await invoke(mw, { userId: "driver-2", ip: "1.1.1.1" });
    assert.equal(first.status, undefined);
    assert.equal(second.status, undefined);
    assert.equal(third.status, 429);
    assert.equal(other.status, undefined);
  });

  it("wires the production booking route to the production limit constants", () => {
    const src = readFileSync(new URL("../routes/index.ts", import.meta.url), "utf8");
    assert.match(src, /rateLimit\(\s*"booking"\s*,\s*positiveIntEnv\(\s*"RATE_LIMIT_BOOKING"\s*,\s*BOOKING_RATE_LIMIT\s*\)/);
    assert.match(src, /rateLimit\(\s*"pay-order"\s*,\s*positiveIntEnv\(\s*"RATE_LIMIT_PAYMENT_ORDER"\s*,\s*PAYMENT_ORDER_LIMIT\s*\)/);
    assert.match(src, /RATE_LIMIT_WEBHOOK/);
    assert.equal(PAYMENT_ORDER_LIMIT, 10);
    assert.equal(PAYMENT_ORDER_WINDOW_MS, 10 * 60_000);
  });

  it("ignores empty or invalid limit overrides and accepts a positive integer", () => {
    const name = "RATE_LIMIT_BOOKING_TEST_ONLY";
    const previous = process.env[name];
    delete process.env[name];
    assert.equal(positiveIntEnv(name, 10), 10);
    process.env[name] = "0";
    assert.equal(positiveIntEnv(name, 10), 10);
    process.env[name] = "15";
    assert.equal(positiveIntEnv(name, 10), 15);
    if (previous == null) delete process.env[name];
    else process.env[name] = previous;
  });
});

describe("sensitive route limits", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  it("allows requests under the limit and returns 429 with Retry-After over the limit", async () => {
    const mw = rateLimit("unit-cap", 2, 60_000, { key: () => "same" });
    const first = await invoke(mw, { ip: "1.1.1.1" });
    const second = await invoke(mw, { ip: "1.1.1.1" });
    const third = await invoke(mw, { ip: "1.1.1.1" });
    assert.equal(first.status, undefined);
    assert.equal(second.status, undefined);
    assert.equal(third.status, 429);
    assert.equal(third.body?.success, false);
    assert.match(third.body?.message ?? "", /too many requests/i);
    assert.ok(Number(third.headers["retry-after"]) >= 1);
  });

  it("keeps account limits independent and ignores email case and surrounding spaces", async () => {
    const mw = rateLimit("unit-account", 1, 60_000, { key: emailKey, audit: "auth" });
    const logs: string[] = [];
    const original = console.warn;
    console.warn = (message?: unknown) => {
      logs.push(String(message));
    };
    try {
      const first = await invoke(mw, { ip: "1.1.1.1", body: { email: "  Ada@Example.com ", password: "SuperSecret1!", otp: "654321" } });
      const replay = await invoke(mw, { ip: "8.8.8.8", body: { email: "ada@example.com", password: "SuperSecret1!", otp: "654321" } });
      const other = await invoke(mw, { ip: "8.8.8.8", body: { email: "other@example.com" } });
      assert.equal(first.status, undefined);
      assert.equal(replay.status, 429);
      assert.equal(other.status, undefined);
    } finally {
      console.warn = original;
    }
    const logged = logs.join("\n");
    assert.match(logged, /rate_limit/);
    assert.doesNotMatch(logged, /ada@example.com/i);
    assert.doesNotMatch(logged, /SuperSecret1!/);
    assert.doesNotMatch(logged, /654321/);
  });

  it("limits each trusted IP separately", async () => {
    const mw = rateLimit("unit-ip", 1, 60_000, { key: (req) => `ip:${req.ip}` });
    const first = await invoke(mw, { ip: "203.0.113.10" });
    const blocked = await invoke(mw, { ip: "203.0.113.10" });
    const other = await invoke(mw, { ip: "203.0.113.11" });
    assert.equal(first.status, undefined);
    assert.equal(blocked.status, 429);
    assert.equal(other.status, undefined);
  });

  it("caps OTP verification per challenge and resend per account token", async () => {
    const verify = rateLimit("unit-otp-verify", 5, 60_000, {
      key: (req) => `challenge:${String((req.body as { pendingToken?: string })?.pendingToken ?? "")}`,
      audit: "otp",
    });
    const resend = rateLimit("unit-otp-resend", 3, 60_000, {
      key: (req) => `challenge:${String((req.body as { pendingToken?: string })?.pendingToken ?? "")}`,
      audit: "otp",
    });
    for (let i = 0; i < 5; i++) {
      assert.equal((await invoke(verify, { ip: "1.1.1.1", body: { pendingToken: "challenge-a", otp: "111111" } })).status, undefined);
    }
    assert.equal((await invoke(verify, { ip: "9.9.9.9", body: { pendingToken: "challenge-a", otp: "111111" } })).status, 429);
    assert.equal((await invoke(verify, { ip: "1.1.1.1", body: { pendingToken: "challenge-b", otp: "111111" } })).status, undefined);
    for (let i = 0; i < 3; i++) {
      assert.equal((await invoke(resend, { ip: "1.1.1.1", body: { pendingToken: "challenge-a" } })).status, undefined);
    }
    assert.equal((await invoke(resend, { ip: "8.8.8.8", body: { pendingToken: "challenge-a" } })).status, 429);
    assert.equal((await invoke(resend, { ip: "1.1.1.1", body: { pendingToken: "challenge-b" } })).status, undefined);
  });

  it("keeps enforcing a limit when the backing store throws", async () => {
    const mw = rateLimit("unit-redis-down", 2, 60_000, {
      key: () => "shared",
      store: new UnavailableRateLimitStore(),
    });
    assert.equal((await invoke(mw, { ip: "1.1.1.1" })).status, undefined);
    assert.equal((await invoke(mw, { ip: "1.1.1.1" })).status, undefined);
    const blocked = await invoke(mw, { ip: "1.1.1.1" });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers["retry-after"]) >= 1);
  });
});

describe("proxy address handling", () => {
  it("ignores a client-supplied X-Forwarded-For when trust proxy is off", async () => {
    const seen = await requestIp(false, { "x-forwarded-for": "9.9.9.9" });
    assert.equal(seen, "127.0.0.1");
    assert.notEqual(seen, "9.9.9.9");
  });

  it("uses only the nearest trusted proxy hop, not a spoofed leftmost address", async () => {
    const seen = await requestIp(1, { "x-forwarded-for": "9.9.9.9, 203.0.113.8" });
    assert.equal(seen, "203.0.113.8");
    assert.notEqual(seen, "9.9.9.9");
  });
});

function invoke(
  mw: ReturnType<typeof rateLimit>,
  req: { userId?: string; ip?: string; body?: Record<string, unknown> }
) {
  return new Promise<{ status?: number; headers: Record<string, string>; body?: { success?: boolean; message?: string } }>((resolve) => {
    const result: { status?: number; headers: Record<string, string>; body?: { success?: boolean; message?: string } } = {
      headers: {},
    };
    const res = {
      headersSent: false,
      status(code: number) {
        result.status = code;
        return this;
      },
      setHeader(name: string, value: number | string) {
        result.headers[name.toLowerCase()] = String(value);
        return this;
      },
      getHeader(name: string) {
        return result.headers[name.toLowerCase()];
      },
      json(body: { success?: boolean; message?: string }) {
        result.body = body;
        resolve(result);
      },
    };
    void Promise.resolve(mw(req as never, res as never, () => resolve(result))).catch((err) => {
      throw err;
    });
  });
}

async function requestIp(trustProxy: boolean | number, headers: Record<string, string>) {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/", (req, res) => {
    res.json({ ip: clientAddress(req) });
  });
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const body = await new Promise<string>((resolve, reject) => {
      const req = http.request(
        { hostname: "127.0.0.1", port, path: "/", headers },
        (response) => {
          const chunks: Buffer[] = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        }
      );
      req.on("error", reject);
      req.end();
    });
    return (JSON.parse(body) as { ip: string }).ip;
  } finally {
    server.close();
  }
}
