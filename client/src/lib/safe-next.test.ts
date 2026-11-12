import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeNextPath } from "./safe-next.js";

describe("safeNextPath", () => {
  it("keeps an in-app path", () => {
    assert.equal(safeNextPath("/parking/abc?start=1"), "/parking/abc?start=1");
  });

  it("rejects protocol-relative and external targets", () => {
    assert.equal(safeNextPath("//evil.example"), "/bookings");
    assert.equal(safeNextPath("https://evil.example"), "/bookings");
    assert.equal(safeNextPath("/\\evil.example"), "/bookings");
    assert.equal(safeNextPath(null), "/bookings");
  });
});
