import assert from "node:assert/strict";
import { describe, it } from "node:test";
import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";
import { attachTransientGetRetry, backoffCap, fullJitterDelay, planClientRetry } from "./retry.ts";

function network(config: InternalAxiosRequestConfig) {
  return new AxiosError("network down", "ERR_NETWORK", config);
}

describe("client GET retry", () => {
  it("keeps jitter inside the exponential window", () => {
    assert.deepEqual(
      [1, 2, 3].map((retry) => backoffCap(retry, 500, 2, 10_000)),
      [500, 1000, 2000]
    );
    assert.equal(fullJitterDelay(500, 0), 0);
    assert.equal(fullJitterDelay(500, 1), 500);
  });

  it("retries a transient GET and leaves POST as one request", async () => {
    let gets = 0;
    let posts = 0;
    const client = axios.create({
      adapter: async (config) => {
        if (config.method === "post") {
          posts += 1;
          throw network(config);
        }
        gets += 1;
        if (gets === 1) throw network(config);
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
      },
    });
    attachTransientGetRetry(client, { sleep: async () => undefined, random: () => 0, now: () => 1_000 });
    const response = await client.get("/listings");
    assert.equal(response.status, 200);
    assert.equal(gets, 2);
    await assert.rejects(() => client.post("/bookings", { slot: 1 }));
    assert.equal(posts, 1);
  });

  it("does not retry a deletion that was refused or rate limited", () => {
    for (const status of [409, 429]) {
      const error = new AxiosError("refused");
      error.response = { status, data: { message: "refused" } } as AxiosError["response"];
      assert.equal(
        planClientRetry({ method: "post", error, attempt: 0, startedAt: 0, now: 10 }),
        null
      );
    }
  });

  it("does not retry a 401, a cancelled call, or a request past the deadline", async () => {
    let denied = 0;
    const client = axios.create({
      adapter: async (config) => {
        denied += 1;
        throw new AxiosError("denied", undefined, config, undefined, {
          status: 401,
          statusText: "Unauthorized",
          headers: {},
          data: {},
          config,
        });
      },
    });
    attachTransientGetRetry(client, { sleep: async () => undefined, random: () => 0, now: () => 1_000 });
    await assert.rejects(() => client.get("/auth/me"));
    assert.equal(denied, 1);

    const cancelled = new AxiosError("canceled", "ERR_CANCELED");
    assert.equal(
      planClientRetry({
        method: "get",
        error: cancelled,
        attempt: 0,
        startedAt: 0,
        now: 10,
        aborted: true,
      }),
      null
    );

    let late = 0;
    let clock = 0;
    const slow = axios.create({
      adapter: async (config) => {
        late += 1;
        clock = 9_000;
        throw network(config);
      },
    });
    attachTransientGetRetry(slow, { sleep: async () => undefined, random: () => 0, now: () => clock });
    await assert.rejects(() => slow.get("/search"));
    assert.equal(late, 1);
  });

  it("honours Retry-After on a GET", async () => {
    const waits: number[] = [];
    let calls = 0;
    const client = axios.create({
      adapter: async (config) => {
        calls += 1;
        if (calls === 1) {
          throw new AxiosError("busy", undefined, config, undefined, {
            status: 429,
            statusText: "Too Many Requests",
            headers: { "retry-after": "2" },
            data: {},
            config,
          });
        }
        return { data: { ok: true }, status: 200, statusText: "OK", headers: {}, config };
      },
    });
    attachTransientGetRetry(client, {
      sleep: async (ms) => {
        waits.push(ms);
      },
      random: () => 1,
      now: () => 1_000,
    });
    const response = await client.get("/faqs");
    assert.equal(response.status, 200);
    assert.deepEqual(waits, [2_000]);
  });
});
