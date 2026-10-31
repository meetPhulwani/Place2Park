import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pickRecentPlaces, recentPlaceFromBooking, upsertRecent, type RecentPlace } from "./recent-places.js";

function place(partial: Partial<RecentPlace> & Pick<RecentPlace, "label" | "q">): RecentPlace {
  return {
    at: 1,
    source: "search",
    ...partial,
  };
}

describe("upsertRecent", () => {
  it("puts a new place first and drops older duplicates", () => {
    const next = upsertRecent(
      [place({ label: "Bandra West", q: "Bandra West", at: 1 }), place({ label: "Powai", q: "Powai", at: 2 })],
      place({ label: "bandra west", q: "Bandra West", at: 9 })
    );
    assert.deepEqual(
      next.map((p) => p.label),
      ["bandra west", "Powai"]
    );
  });

  it("keeps only the latest eight places", () => {
    const list = Array.from({ length: 8 }, (_, i) => place({ label: `P${i}`, q: `P${i}`, at: i }));
    const next = upsertRecent(list, place({ label: "New", q: "New", at: 99 }));
    assert.equal(next.length, 8);
    assert.equal(next[0]?.label, "New");
    assert.equal(next.at(-1)?.label, "P6");
  });
});

describe("pickRecentPlaces", () => {
  it("returns the last two places the user went, filling from searches", () => {
    const went = [
      place({ label: "BKC", q: "Bandra Kurla Complex", source: "booking", at: 20 }),
      place({ label: "Worli", q: "Worli", source: "booking", at: 10 }),
      place({ label: "Juhu", q: "Juhu", source: "booking", at: 5 }),
    ];
    const searched = [place({ label: "Andheri", q: "Andheri West", at: 30 })];
    assert.deepEqual(
      pickRecentPlaces(went, searched).map((p) => p.label),
      ["BKC", "Worli"]
    );
  });

  it("fills remaining slots from recent searches when the user has been to fewer than two places", () => {
    const went = [place({ label: "Powai", q: "Powai", source: "booking", at: 4 })];
    const searched = [
      place({ label: "Powai", q: "Powai", at: 9 }),
      place({ label: "Bandra West", q: "Bandra West", at: 8 }),
    ];
    assert.deepEqual(
      pickRecentPlaces(went, searched).map((p) => p.label),
      ["Powai", "Bandra West"]
    );
  });

  it("uses searches alone when there is no booking history", () => {
    const searched = [
      place({ label: "Andheri", q: "Andheri West", at: 2 }),
      place({ label: "Bandra West", q: "Bandra West", at: 1 }),
    ];
    assert.deepEqual(
      pickRecentPlaces([], searched).map((p) => p.label),
      ["Andheri", "Bandra West"]
    );
  });
});

describe("recentPlaceFromBooking", () => {
  it("uses the listing area as the place the driver went, without a street address", () => {
    const place = recentPlaceFromBooking({
      start: "2026-10-20T10:00:00.000Z",
      spaceId: {
        id: "s1",
        title: "Covered basement spot near Bandra Linking Road",
        area: "Bandra West",
        city: "Mumbai",
        latitude: 19.06,
        longitude: 72.83,
        images: [{ url: "https://example.com/p.jpg", alt: "", sortOrder: 0 }],
      },
    });
    assert.equal(place?.label, "Bandra West");
    assert.equal(place?.city, "Mumbai");
    assert.equal(place?.q, "Bandra West");
    assert.equal(place?.lat, 19.06);
    assert.equal(place?.lng, 72.83);
    assert.equal(place?.imageUrl, "https://example.com/p.jpg");
    assert.equal(place?.source, "booking");
  });

  it("skips bookings with no populated space", () => {
    assert.equal(recentPlaceFromBooking({ start: "2026-10-20T10:00:00.000Z", spaceId: "s1" }), null);
  });
});
