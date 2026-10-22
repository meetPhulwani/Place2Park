import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeQuote } from "./pricing.js";
import { PLATFORM_FEE_PCT, SERVICE_FEE_PCT } from "./constants.js";

describe("computeQuote", () => {
  it("uses 5% driver fee and 10% host commission for a ₹500 parking fee", () => {
    const quote = computeQuote(50000, 60);
    assert.equal(quote.baseAmount, 50000);
    assert.equal(quote.serviceFee, 2500);
    assert.equal(quote.totalAmount, 52500);
    assert.equal(quote.platformFee, 5000);
    assert.equal(quote.hostEarning, 45000);
    assert.equal(quote.serviceFee + quote.platformFee, 7500);
    assert.equal(SERVICE_FEE_PCT, 5);
    assert.equal(PLATFORM_FEE_PCT, 10);
  });

  it("computes parking fee, host commission and driver total in paise", () => {
    const quote = computeQuote(3500, 120); // ₹35/hr × 2h = ₹70
    assert.equal(quote.baseAmount, 7000);
    assert.equal(quote.serviceFee, 350);
    assert.equal(quote.totalAmount, 7350);
    assert.equal(quote.platformFee, 700);
    assert.equal(quote.hostEarning, 6300);
  });

  it("rounds each fee to the nearest paise independently", () => {
    const quote = computeQuote(3333, 60);
    assert.equal(quote.baseAmount, 3333);
    assert.equal(quote.serviceFee, 167); // 166.65
    assert.equal(quote.platformFee, 333); // 333.3
    assert.equal(quote.hostEarning, 3000);
    assert.equal(quote.totalAmount, 3500);
  });

  it("treats a free hour as zero fees", () => {
    const quote = computeQuote(0, 60);
    assert.equal(quote.baseAmount, 0);
    assert.equal(quote.serviceFee, 0);
    assert.equal(quote.platformFee, 0);
    assert.equal(quote.hostEarning, 0);
    assert.equal(quote.totalAmount, 0);
  });

  it("does not use any client-supplied total", () => {
    const quote = computeQuote(4000, 60);
    assert.equal(quote.totalAmount, quote.baseAmount + quote.serviceFee);
    assert.equal(quote.hostEarning, quote.baseAmount - quote.platformFee);
    assert.notEqual(quote.totalAmount, 1);
  });

  it("rejects invalid prices and durations", () => {
    assert.throws(() => computeQuote(Number.NaN, 60), /Price must be a non-negative/);
    assert.throws(() => computeQuote(-100, 60), /Price must be a non-negative/);
    assert.throws(() => computeQuote(50000, 0), /Duration must be a positive/);
    assert.throws(() => computeQuote(50000, Number.POSITIVE_INFINITY), /Duration must be a positive/);
  });
});
