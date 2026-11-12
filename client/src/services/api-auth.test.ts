import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authorizationHeader } from "./api.ts";

describe("deletion request authentication", () => {
  it("attaches the session token and leaves the header off when signed out", () => {
    assert.deepEqual(authorizationHeader("session-token"), { Authorization: "Bearer session-token" });
    assert.deepEqual(authorizationHeader(null), {});
    assert.deepEqual(authorizationHeader(""), {});
  });
});
