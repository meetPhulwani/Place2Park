import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELETE_CONFIRMATION,
  confirmationMatches,
  shouldBlockConfirmClipboard,
  shouldBlockConfirmShortcut,
} from "./confirm-deletion.js";

describe("account deletion confirmation", () => {
  it("accepts only the exact word CONFIRM", () => {
    assert.equal(DELETE_CONFIRMATION, "CONFIRM");
    assert.equal(confirmationMatches("CONFIRM"), true);
    assert.equal(confirmationMatches(""), false);
    assert.equal(confirmationMatches("confirm"), false);
    assert.equal(confirmationMatches(" CONFIRM"), false);
    assert.equal(confirmationMatches("CONFIRM "), false);
    assert.equal(confirmationMatches("DELETE MY ACCOUNT"), false);
  });

  it("blocks paste, cut, and drop into the confirmation field", () => {
    assert.equal(shouldBlockConfirmClipboard("paste"), true);
    assert.equal(shouldBlockConfirmClipboard("cut"), true);
    assert.equal(shouldBlockConfirmClipboard("drop"), true);
    assert.equal(shouldBlockConfirmClipboard("input"), false);
  });

  it("blocks paste shortcuts on Windows and macOS", () => {
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "v" }), true);
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "V" }), true);
    assert.equal(shouldBlockConfirmShortcut({ metaKey: true, key: "v" }), true);
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "c" }), false);
    assert.equal(shouldBlockConfirmShortcut({ key: "v" }), false);
  });
});
