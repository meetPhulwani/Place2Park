import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQuote } from "./pricing.js";

describe("computeQuote", () => {
  it("computes parking fee, platform fee and total in paise on the server", () => {
    const quote = computeQuote(3500, 120); // ₹35/hr × 2h
    assert.equal(quote.baseAmount, 7000);
    assert.equal(quote.serviceFee, 350);
    assert.equal(quote.totalAmount, 7350);
    assert.equal(quote.platformFee, 1050);
    assert.equal(quote.hostEarning, 5950);
  });

  it("does not use any client-supplied total", () => {
    const quote = computeQuote(4000, 60);
    assert.equal(quote.totalAmount, quote.baseAmount + quote.serviceFee);
    assert.notEqual(quote.totalAmount, 1);
  });
});
