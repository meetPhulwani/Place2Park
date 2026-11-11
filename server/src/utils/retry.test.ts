import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mongoConnectOptions, timeouts } from "../config/timeouts.js";
import {
  backoffCap,
  chooseDelay,
  classifyError,
  fullJitterDelay,
  parseRetryAfter,
  resetRetryMetrics,
  retryMetricsSnapshot,
  retryOperation,
  singleAttempt,
} from "./retry.js";

function timeoutError() {
  return Object.assign(new Error("timeout contacting provider"), { code: "ETIMEDOUT" });
}

describe("retry backoff", () => {
  it("grows the exponential window and keeps full jitter inside it", () => {
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((retry) => backoffCap(retry, 500, 2, 10_000)),
      [500, 1000, 2000, 4000, 8000, 10_000]
    );
    assert.equal(fullJitterDelay(500, 0), 0);
    assert.equal(fullJitterDelay(500, 1), 500);
    const mid = fullJitterDelay(500, 0.5);
    assert.ok(mid >= 0 && mid <= 500);
    assert.equal(chooseDelay(1, 500, 2, 10_000, 1, 1_500), 1_500);
    assert.equal(chooseDelay(1, 500, 2, 1_000, 1, 20_000), 1_000);
  });

  it("reads Retry-After seconds and dates", () => {
    assert.equal(parseRetryAfter("2", 1_000), 2_000);
    assert.equal(parseRetryAfter(new Date(5_000).toUTCString(), 1_000), 4_000);
    assert.equal(parseRetryAfter("not-a-date"), undefined);
  });

  it("stops after the maximum attempts", async () => {
    resetRetryMetrics();
    let calls = 0;
    await assert.rejects(
      () =>
        retryOperation(
          async () => {
            calls += 1;
            throw timeoutError();
          },
          {
            service: "demo",
            operation: "read",
            maxAttempts: 4,
            initialDelayMs: 500,
            deadlineMs: 60_000,
            random: () => 0,
            now: () => 0,
            sleep: async () => undefined,
            log: () => undefined,
            retryCategories: ["timeout"],
          }
        ),
      /timeout contacting provider/
    );
    assert.equal(calls, 4);
    assert.equal(retryMetricsSnapshot().demo?.exhausted, 1);
    assert.equal(retryMetricsSnapshot().demo?.attempts, 3);
  });

  it("stops when the next wait would pass the deadline", async () => {
    let calls = 0;
    let clock = 0;
    await assert.rejects(
      () =>
        retryOperation(
          async () => {
            calls += 1;
            throw timeoutError();
          },
          {
            service: "budget",
            operation: "read",
            maxAttempts: 4,
            initialDelayMs: 500,
            maxDelayMs: 10_000,
            deadlineMs: 1_000,
            random: () => 1,
            now: () => clock,
            sleep: async (ms) => {
              clock += ms;
            },
            log: () => undefined,
            retryCategories: ["timeout"],
          }
        ),
      /timeout/
    );
    assert.equal(calls, 2);
    assert.equal(retryMetricsSnapshot().budget?.exhausted, 1);
  });

  it("uses Retry-After and does not retry a permanent error", async () => {
    resetRetryMetrics();
    const delays: number[] = [];
    let limited = 0;
    const value = await retryOperation(
      async () => {
        limited += 1;
        if (limited === 1) {
          throw Object.assign(new Error("slow down"), { status: 429, headers: { "retry-after": "2" } });
        }
        return "ok";
      },
      {
        service: "limited",
        operation: "read",
        maxAttempts: 3,
        random: () => 1,
        now: () => 0,
        sleep: async (ms) => {
          delays.push(ms);
        },
        log: () => undefined,
        retryCategories: ["rate_limited"],
      }
    );
    assert.equal(value, "ok");
    assert.deepEqual(delays, [2_000]);
    assert.equal(retryMetricsSnapshot().limited?.recovered, 1);

    let rejected = 0;
    await assert.rejects(
      () =>
        retryOperation(
          async () => {
            rejected += 1;
            throw Object.assign(new Error("bad"), { status: 400 });
          },
          {
            service: "permanent",
            operation: "write",
            maxAttempts: 4,
            sleep: async () => undefined,
            log: () => undefined,
          }
        ),
      /bad/
    );
    assert.equal(rejected, 1);
    assert.equal(classifyError(Object.assign(new Error("nope"), { status: 401 })).category, "auth");
    assert.equal(classifyError(Object.assign(new Error("missing"), { status: 404 })).category, "permanent");
    assert.equal(classifyError(Object.assign(new Error("reset"), { code: "ECONNRESET" })).category, "transient_network");
  });

  it("stops during the wait when the caller cancels", async () => {
    const controller = new AbortController();
    let calls = 0;
    await assert.rejects(
      () =>
        retryOperation(
          async () => {
            calls += 1;
            throw Object.assign(new Error("reset"), { code: "ECONNRESET" });
          },
          {
            service: "cancel",
            operation: "read",
            maxAttempts: 4,
            signal: controller.signal,
            now: () => 0,
            random: () => 0,
            sleep: async () => {
              controller.abort();
              throw Object.assign(new Error("retry cancelled"), { name: "AbortError", code: "ERR_CANCELED" });
            },
            log: () => undefined,
            retryCategories: ["transient_network"],
          }
        ),
      (err: unknown) => err instanceof Error && err.name === "AbortError"
    );
    assert.equal(calls, 1);
  });

  it("recovers after a temporary failure and keeps secrets out of the retry log", async () => {
    resetRetryMetrics();
    const logs: string[] = [];
    let calls = 0;
    const value = await retryOperation(
      async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("timeout sk_live_secret otp-1234"), { code: "ETIMEDOUT" });
        return "ready";
      },
      {
        service: "recover",
        operation: "fetch",
        maxAttempts: 3,
        random: () => 0,
        now: () => 0,
        sleep: async () => undefined,
        log: (event) => logs.push(JSON.stringify(event)),
        retryCategories: ["timeout"],
      }
    );
    assert.equal(value, "ready");
    assert.equal(calls, 2);
    assert.equal(logs.length, 1);
    assert.equal(logs[0]?.includes("sk_live_secret"), false);
    assert.equal(logs[0]?.includes("otp-1234"), false);
    assert.match(logs[0] ?? "", /"category":"timeout"/);
    assert.equal(retryMetricsSnapshot().recover?.recovered, 1);
    assert.equal(retryMetricsSnapshot().recover?.timeouts, 1);
  });

  it("keeps financial writes, uploads, bookings, and Redis commands to one attempt", () => {
    assert.equal(singleAttempt.razorpayCharge, 1);
    assert.equal(singleAttempt.razorpayRefund, 1);
    assert.equal(singleAttempt.bookingCreate, 1);
    assert.equal(singleAttempt.cloudinaryUpload, 1);
    assert.equal(singleAttempt.payoutTransfer, 1);
    assert.equal(singleAttempt.smtpSend, 1);
    assert.equal(timeouts.redisCommandRetries, 1);
    const mongo = mongoConnectOptions();
    assert.equal(mongo.retryReads, true);
    assert.equal(mongo.retryWrites, true);
  });
});
