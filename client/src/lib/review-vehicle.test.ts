import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canSkipReview, reviewCategories, reviewGateMessage, reviewPrompt } from "./review-flow.ts";
import { nextArrivalStep, plateMatchesQuestion } from "./vehicle-arrival-flow.ts";

describe("review and vehicle prompts", () => {
  it("uses the two review questions and keeps skip friendly until the limit", () => {
    assert.equal(reviewPrompt("DRIVER"), "How was your parking experience?");
    assert.equal(reviewPrompt("HOST"), "How was your experience with this driver?");
    assert.equal(reviewCategories("DRIVER").length, 3);
    assert.equal(reviewCategories("HOST").length, 2);
    assert.equal(canSkipReview(0), true);
    assert.equal(canSkipReview(2), true);
    assert.equal(canSkipReview(3), false);
    assert.match(reviewGateMessage(true), /pending review/i);
    assert.equal(reviewGateMessage(false), "");
  });

  it("puts a mismatch behind a warning and a second confirmation", () => {
    assert.equal(nextArrivalStep("ask", "yes"), "code");
    assert.equal(nextArrivalStep("ask", "no"), "warn");
    assert.equal(nextArrivalStep("warn", "back"), "ask");
    assert.equal(nextArrivalStep("warn", "continue"), "risk");
    assert.equal(nextArrivalStep("risk", "back"), "warn");
    assert.equal(nextArrivalStep("risk", "confirm"), "code");
    assert.match(plateMatchesQuestion("KA 01 AB 1234"), /KA 01 AB 1234/);
  });
});