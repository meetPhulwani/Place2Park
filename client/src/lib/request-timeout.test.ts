import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AxiosError } from "axios";
import { API_TIMEOUT_MS, canAutoRetry, createSingleFlight, isRequestAbort, isRequestTimeout } from "./request-timeout.ts";

describe("client request timeout", () => {
  it("keeps a bounded client timeout and retries only safe reads", () => {
    assert.ok(API_TIMEOUT_MS >= 1000);
    assert.equal(canAutoRetry("GET"), true);
    assert.equal(canAutoRetry("HEAD"), true);
    assert.equal(canAutoRetry("POST"), false);
    assert.equal(canAutoRetry("PATCH"), false);
    assert.equal(canAutoRetry("DELETE"), false);
  });

  it("tells a timeout apart from a cancelled request", () => {
    const timeout = new AxiosError("timeout of 25000ms exceeded");
    timeout.code = "ECONNABORTED";
    const aborted = new AxiosError("canceled");
    aborted.code = "ERR_CANCELED";
    assert.equal(isRequestTimeout(timeout), true);
    assert.equal(isRequestAbort(timeout), false);
    assert.equal(isRequestAbort(aborted), true);
    assert.equal(isRequestTimeout(aborted), false);
  });

  it("ignores a second submit while the first request is still running", async () => {
    const run = createSingleFlight();
    let started = 0;
    const first = run(async () => {
      started += 1;
      await new Promise((resolve) => setTimeout(resolve, 30));
      return "done";
    });
    const second = await run(async () => {
      started += 1;
      return "again";
    });
    assert.equal(second, undefined);
    assert.equal(await first, "done");
    assert.equal(started, 1);
  });
});
