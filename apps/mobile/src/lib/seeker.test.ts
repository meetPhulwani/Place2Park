import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiRequestError } from "../api/client";
import { locationAccess, locationFailureMessage, settingsHint } from "./location-access";
import { amenityLabels, greeting, homeSections, listPhase, markersFor, parseListingDetail, parseSearchPayload, selectedListing, validCoordinate } from "./listings";
import { formatHourlyPrice } from "./money";
import { applyReturnedSort, createRecentSearches, createSearchDebounce, parsePredictions, searchQuery } from "./search";
import type { SpaceSummary } from "../types/listing";

const space = (overrides: Partial<SpaceSummary> = {}): SpaceSummary => ({
  id: "space-1",
  title: "Shaded bay",
  area: "Bandra",
  city: "Mumbai",
  locality: "Bandra West",
  displayLocation: "Bandra West, Mumbai",
  latitude: 19.05,
  longitude: 72.83,
  pricePerHour: 5000,
  ratingAvg: 4.5,
  ratingCount: 8,
  covered: true,
  evCharging: false,
  cctv: true,
  verified: true,
  vehicleTypes: "CAR,BIKE",
  level: "GROUND",
  propertyType: "INDIVIDUAL",
  imageUrl: null,
  distanceKm: 1.2,
  available: null,
  ...overrides,
});

describe("seeker home", () => {
  it("greets the signed-in person and recommends only rated spaces that are not already in the top row", () => {
    assert.equal(greeting("Asha Mehta", 9), "Good morning, Asha");
    const sections = homeSections(
      [
        space({ id: "a", ratingCount: 0 }),
        space({ id: "b", ratingCount: 0 }),
        space({ id: "c", ratingCount: 0 }),
        space({ id: "d", ratingCount: 3, ratingAvg: 5 }),
      ],
      [space({ id: "saved" })]
    );
    assert.equal(sections.nearby.length, 4);
    assert.deepEqual(sections.recommended.map((item) => item.id), ["d"]);
    assert.equal(sections.saved[0]?.id, "saved");
    assert.equal(homeSections([space({ ratingCount: 0 })], []).recommended.length, 0);
  });
});

describe("location permission", () => {
  it("distinguishes a denial that can be asked again from one that needs settings", () => {
    assert.equal(locationAccess("granted", true), "granted");
    assert.equal(locationAccess("denied", true), "denied");
    assert.equal(locationAccess("denied", false), "blocked");
    assert.match(settingsHint("blocked") ?? "", /settings/);
    assert.match(locationFailureMessage(new Error("Location services are disabled")), /turned off/);
  });
});

describe("search", () => {
  it("parses listing suggestions and keeps recent searches", () => {
    const predictions = parsePredictions({
      predictions: [
        { id: "listing:Bandra:19:72", mainText: "Bandra", secondaryText: "Mumbai", lat: 19.05, lng: 72.83, source: "listing" },
        { id: "bad", mainText: "Nope" },
      ],
    });
    assert.equal(predictions.length, 1);
    assert.equal(predictions[0]?.mainText, "Bandra");
    const recent = createRecentSearches();
    recent.add("Bandra");
    recent.add("bandra");
    recent.add("Andheri");
    assert.deepEqual(recent.list(), ["Andheri", "bandra"]);
    recent.clear();
    assert.deepEqual(recent.list(), []);
  });

  it("fires only the latest debounced search", () => {
    const pending: (() => void)[] = [];
    const debounce = createSearchDebounce(300, (fn) => {
      pending.push(fn);
      return pending.length;
    }, () => undefined);
    const fired: string[] = [];
    debounce.run(() => fired.push("first"));
    debounce.run(() => fired.push("second"));
    pending[0]?.();
    pending[1]?.();
    assert.deepEqual(fired, ["second"]);
  });

  it("sends only filters the search API accepts", () => {
    const query = searchQuery({
      q: "Bandra",
      lat: 19.05,
      lng: 72.83,
      maxPrice: 80,
      covered: true,
      ev: true,
      vehicleType: "CAR",
      minRating: 4,
      sort: "highest-price",
      maxDistanceKm: 5,
      start: "2026-11-20T10:00:00.000Z",
      durationMins: 60,
    });
    const params = new URLSearchParams(query);
    assert.equal(params.get("q"), "Bandra");
    assert.equal(params.get("maxPrice"), "80");
    assert.equal(params.get("covered"), "true");
    assert.equal(params.get("vehicleType"), "CAR");
    assert.equal(params.get("sort"), null);
    assert.equal(params.has("minPrice"), false);
    const sorted = applyReturnedSort([space({ id: "low", pricePerHour: 1000 }), space({ id: "high", pricePerHour: 9000 })], "highest-price");
    assert.equal(sorted[0]?.id, "high");
  });
});

describe("listings", () => {
  it("keeps returned listings and drops invalid coordinates", () => {
    const parsed = parseSearchPayload({
      results: [space(), { id: "bad" }, { ...space(), id: "zero", latitude: 0, longitude: 0 }],
      center: { lat: 19, lng: 72 },
      resolvedArea: "Bandra",
    });
    assert.equal(parsed.results.length, 2);
    assert.equal(parsed.results[1]?.latitude, null);
    assert.equal(markersFor(parsed.results).length, 1);
    assert.equal(selectedListing(parsed.results, "space-1")?.title, "Shaded bay");
    assert.equal(selectedListing(parsed.results, "missing"), null);
    assert.equal(validCoordinate(0, 0), false);
    assert.match(formatHourlyPrice(5000), /50/);
    assert.match(formatHourlyPrice(5000), /\/hr$/);
    assert.deepEqual(amenityLabels(space()), ["Covered", "CCTV", "Verified"]);
  });

  it("shows loading, empty, and error phases", () => {
    assert.equal(listPhase("pending", 0), "loading");
    assert.equal(listPhase("success", 0), "empty");
    assert.equal(listPhase("error", 0), "error");
    assert.equal(listPhase("success", 2), "results");
  });

  it("hides the exact address and access instructions unless the API reveals them", () => {
    const hidden = parseListingDetail({
      space: {
        id: "space-1",
        title: "Shaded bay",
        pricePerHour: 5000,
        address: "12 Secret Lane",
        accessInstructions: "Gate code 1234",
        latitude: 19.05,
        longitude: 72.83,
        vehicleTypes: "CAR",
        images: [{ url: "https://cdn.example/a.jpg", alt: "Bay" }],
      },
      revealExactLocation: false,
      isFavorite: false,
      host: { name: "Place2Park host", image: "" },
      reviews: [{ id: "r1", rating: 5, comment: "Easy", user: { name: "Asha" } }],
    });
    assert.equal(hidden?.address, "");
    assert.equal(hidden?.accessInstructions, "");
    assert.equal(hidden?.images.length, 1);
    assert.equal(hidden?.reviews[0]?.author, "Asha");
  });
});

describe("session expiry", () => {
  it("recognises an expired session without treating other failures as expiry", () => {
    const expired = new ApiRequestError("Your session has expired. Please log in again.", 401);
    const offline = new ApiRequestError("Can't reach the server. Check your connection.", null);
    assert.equal(expired.status, 401);
    assert.equal(offline.status, null);
  });
});
