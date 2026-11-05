import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AxiosError } from "axios";
import { errorCopy, pageErrorStatus } from "./http-error.ts";

describe("error pages", () => {
  it("keeps a frontend miss on 404 and does not reuse that copy for other codes", () => {
    const missing = errorCopy(404);
    assert.equal(missing.code, "404");
    assert.equal(missing.label, "PAGE NOT FOUND");
    assert.equal(missing.description, "This page doesn't exist or may have been moved.");
    assert.notEqual(errorCopy(403).label, missing.label);
    assert.notEqual(errorCopy(500).label, missing.label);
    assert.notEqual(errorCopy(503).label, missing.label);
  });

  it("names each supported HTTP error without a server payload", () => {
    const expected: Record<number, string> = {
      400: "BAD REQUEST",
      401: "UNAUTHORIZED",
      403: "ACCESS FORBIDDEN",
      408: "REQUEST TIMEOUT",
      429: "TOO MANY REQUESTS",
      500: "INTERNAL SERVER ERROR",
      502: "BAD GATEWAY",
      503: "SERVICE UNAVAILABLE",
    };
    for (const [status, label] of Object.entries(expected)) {
      const copy = errorCopy(Number(status));
      assert.equal(copy.label, label);
      assert.equal(copy.description.includes("stack"), false);
      assert.equal(copy.description.includes("/"), false);
    }
  });

  it("preserves an API status instead of turning it into a 404", () => {
    const notFound = new AxiosError("missing");
    notFound.response = { status: 404, data: { message: "secret path /internal" } } as AxiosError["response"];
    const server = new AxiosError("boom");
    server.response = { status: 500, data: { message: "Error: at /server/src/app.ts" } } as AxiosError["response"];
    const down = new AxiosError("unavailable");
    down.response = { status: 503, data: { message: "redis down" } } as AxiosError["response"];
    const denied = new AxiosError("nope");
    denied.response = { status: 403, data: { message: "You don't have access to this." } } as AxiosError["response"];

    assert.equal(pageErrorStatus(notFound), 404);
    assert.equal(pageErrorStatus(server), 500);
    assert.equal(pageErrorStatus(down), 503);
    assert.equal(pageErrorStatus(denied), 403);
    assert.equal(errorCopy(pageErrorStatus(server)).description.includes("app.ts"), false);
  });

  it("treats a timeout as 408 and an unreachable API as 503", () => {
    const timeout = new AxiosError("timeout of 25000ms exceeded");
    timeout.code = "ECONNABORTED";
    const offline = new AxiosError("Network Error");
    offline.code = "ERR_NETWORK";
    assert.equal(pageErrorStatus(timeout), 408);
    assert.equal(pageErrorStatus(offline), 503);
  });
});
