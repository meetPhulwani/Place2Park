import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { suggestionMenuFrame } from "./suggestion-menu.js";

describe("suggestion menu frame", () => {
  it("keeps the list under the field when the viewport has room", () => {
    const frame = suggestionMenuFrame({
      inputTop: 560,
      inputBottom: 604,
      viewportTop: 0,
      viewportBottom: 852,
      clipBottom: 852,
      safeBottom: 0,
      appliedLift: 0,
      chromeTop: 76,
    });
    assert.equal(frame.lift, 0);
    assert.ok(frame.maxHeight >= 168);
    assert.ok(604 + 6 + frame.maxHeight <= 852);
  });

  it("lifts the dock when the iPhone clip and home indicator would hide the list", () => {
    const frame = suggestionMenuFrame({
      inputTop: 700,
      inputBottom: 744,
      viewportTop: 0,
      viewportBottom: 852,
      clipBottom: 780,
      safeBottom: 34,
      appliedLift: 0,
      chromeTop: 76,
    });
    assert.ok(frame.lift > 0);
    assert.ok(frame.maxHeight >= 72);
    assert.ok(744 - frame.lift + 6 + Math.min(frame.maxHeight, 168) <= 780 - 34);
  });

  it("stops the lift before the list covers the top map controls", () => {
    const frame = suggestionMenuFrame({
      inputTop: 120,
      inputBottom: 164,
      viewportTop: 0,
      viewportBottom: 400,
      clipBottom: 220,
      safeBottom: 0,
      appliedLift: 0,
      chromeTop: 76,
    });
    assert.ok(frame.lift <= 120 - 76);
  });
});
