import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELETE_CONFIRMATION,
  claimDeletionSubmit,
  confirmationMatches,
  deletionOutcome,
  releaseDeletionSubmit,
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

  it("shows an open-case refusal as the server explanation", () => {
    const blocked = deletionOutcome(
      409,
      "You have an active booking. Finish or cancel it before deleting your account.",
      "We couldn't delete this account."
    );
    assert.equal(blocked.kind, "blocked");
    assert.equal(blocked.message, "You have an active booking. Finish or cancel it before deleting your account.");
    const expired = deletionOutcome(401, "Please log in to continue.", "We couldn't delete this account.");
    assert.equal(expired.kind, "failed");
    assert.equal(expired.retry, false);
    assert.equal(expired.message, "Please log in to continue.");
    const limited = deletionOutcome(429, "Too many requests. Try again shortly.", "We couldn't delete this account.");
    assert.equal(limited.kind, "limited");
    assert.equal(limited.retry, false);
    assert.match(limited.message, /Wait 15 minutes/);
    assert.doesNotMatch(limited.message, /support case/i);
  });

  it("ignores a second deletion submit while the first is still running", async () => {
    const state = { current: false };
    assert.equal(claimDeletionSubmit(state), true);
    assert.equal(claimDeletionSubmit(state), false);
    let started = 0;
    if (claimDeletionSubmit(state)) started += 1;
    assert.equal(started, 0);
    releaseDeletionSubmit(state);
    assert.equal(claimDeletionSubmit(state), true);
    releaseDeletionSubmit(state);
  });

  it("blocks paste shortcuts on Windows and macOS", () => {
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "v" }), true);
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "V" }), true);
    assert.equal(shouldBlockConfirmShortcut({ metaKey: true, key: "v" }), true);
    assert.equal(shouldBlockConfirmShortcut({ ctrlKey: true, key: "c" }), false);
    assert.equal(shouldBlockConfirmShortcut({ key: "v" }), false);
  });
});
