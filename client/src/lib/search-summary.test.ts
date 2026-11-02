import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterSummary,
  finiteCoord,
  formatSearchDateLabel,
  formatSearchTimeLabel,
  hasDestinationCoords,
  selectedPlaceLabel,
} from "./search-summary.js";

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

describe("selectedPlaceLabel", () => {
  it("keeps the address the user selected instead of the first locality token", () => {
    assert.equal(
      selectedPlaceLabel({
        formattedAddress: "Shahad Station Road, Kalyan, Maharashtra",
        locality: "Kalyan",
        city: "Kalyan",
      }),
      "Shahad Station Road, Kalyan, Maharashtra"
    );
  });

  it("does not invent a place when nothing was selected", () => {
    assert.equal(selectedPlaceLabel({}), "");
    assert.equal(selectedPlaceLabel({ formattedAddress: "Pinned location", city: "Mumbai" }), "Mumbai");
  });
});

describe("search date and time labels", () => {
  const monday = new Date(2026, 10, 2, 10, 0, 0);

  it("marks the selected local day as today and names that weekday", () => {
    assert.equal(formatSearchDateLabel(monday.toISOString(), new Date(2026, 10, 2, 8, 0)), "Today · Monday, 2 November");
    assert.equal(formatSearchDateLabel("2026-11-03", new Date(2026, 10, 2, 8, 0)), "Tuesday, 3 November");
  });

  it("reads a date-only value as a local calendar day", () => {
    assert.equal(formatSearchDateLabel("2026-11-02", new Date(2026, 10, 2, 23, 30)), "Today · Monday, 2 November");
    assert.equal(formatSearchTimeLabel("2026-11-02", 120), null);
  });

  it("shows the selected start and end, and nothing when no time was chosen", () => {
    assert.equal(formatSearchTimeLabel(monday.toISOString(), 240), "10:00 AM – 2:00 PM");
    assert.equal(formatSearchTimeLabel(new Date(2026, 10, 2, 18, 0, 0).toISOString(), 240), "6:00 PM – 10:00 PM");
    assert.equal(formatSearchTimeLabel(monday.toISOString()), "10:00 AM");
    assert.equal(formatSearchDateLabel(undefined, monday), null);
    assert.equal(formatSearchTimeLabel(undefined, 120), null);
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
