import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it, beforeEach } from "node:test";
import {
  BOOKING_RATE_LIMIT,
  BOOKING_RATE_WINDOW_MS,
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
    assert.match(src, /rateLimit\(\s*"booking"\s*,\s*BOOKING_RATE_LIMIT\s*,\s*BOOKING_RATE_WINDOW_MS\s*\)/);
  });
});

function invoke(mw: ReturnType<typeof rateLimit>, req: { userId?: string; ip?: string }) {
  return new Promise<{ status?: number }>((resolve) => {
    const result: { status?: number } = {};
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json() {
        resolve(result);
      },
    };
    mw(req as never, res as never, () => resolve(result));
  });
}
