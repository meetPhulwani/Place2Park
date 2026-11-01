import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveApiBase } from "./api-base.js";

describe("API base URL", () => {
  it("keeps the local proxy prefix", () => {
    assert.equal(resolveApiBase(undefined), "/api");
    assert.equal(resolveApiBase(""), "/api");
    assert.equal(resolveApiBase("/api"), "/api");
    assert.equal(resolveApiBase("/api/"), "/api");
  });

  it("adds the /api prefix when the production host is set without it", () => {
    assert.equal(resolveApiBase("https://api.place2park.me"), "https://api.place2park.me/api");
    assert.equal(resolveApiBase("https://api.place2park.me/"), "https://api.place2park.me/api");
  });

  it("does not double the prefix when it is already present", () => {
    assert.equal(resolveApiBase("https://api.place2park.me/api"), "https://api.place2park.me/api");
    assert.equal(resolveApiBase("https://api.place2park.me/api/"), "https://api.place2park.me/api");
  });
});
