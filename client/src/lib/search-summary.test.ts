import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterSummary, finiteCoord, hasDestinationCoords } from "./search-summary.js";

describe("filterSummary", () => {
  it("stays empty when only the default sort is active", () => {
    assert.equal(filterSummary({ sort: "closest" }), "");
  });

  it("joins the filters that change the result set", () => {
    assert.equal(
      filterSummary({
        vehicleType: "CAR",
        covered: true,
        ev: true,
        maxPrice: 50,
        maxDistanceKm: 2,
        minRating: 4,
        sort: "cheapest",
      }),
      "Car · Covered · EV · Up to ₹50/hr · Within 2 km · 4+ rating · Cheapest"
    );
  });
});

describe("destination coordinates", () => {
  it("accepts finite coordinates and rejects blanks", () => {
    assert.equal(finiteCoord("19.06"), 19.06);
    assert.equal(finiteCoord(""), null);
    assert.equal(finiteCoord("nope"), null);
    assert.equal(hasDestinationCoords(19.06, 72.83), true);
    assert.equal(hasDestinationCoords(null, 72.83), false);
  });
});
