import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accountDigitsLabel, nextRevealedAccount, REVEAL_TTL_MS } from "./payout-reveal.js";

describe("admin payout reveal display", () => {
  it("masks last4 until an explicit reveal and clears on leave or refresh", () => {
    assert.equal(accountDigitsLabel("9012", null), "****9012");
    assert.equal(accountDigitsLabel("9012", "123456789012"), "123456789012");
    assert.equal(nextRevealedAccount(null, "reveal", "123456789012"), "123456789012");
    assert.equal(nextRevealedAccount("123456789012", "hide"), null);
    assert.equal(nextRevealedAccount("123456789012", "unmount"), null);
    assert.equal(nextRevealedAccount("123456789012", "refresh"), null);
    assert.equal(nextRevealedAccount("123456789012", "hidden"), null);
    assert.equal(nextRevealedAccount("123456789012", "ttl"), null);
    assert.equal(REVEAL_TTL_MS, 60_000);
  });
});
