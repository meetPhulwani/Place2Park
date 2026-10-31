import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildTimelineDays, formatTimelineDate } from "./booking-timeline.js";

function localIso(year: number, month: number, day: number, hour: number) {
  return new Date(year, month - 1, day, hour, 0, 0).toISOString();
}

describe("buildTimelineDays", () => {
  it("groups occupied bookings by local start date and skips cancelled or expired rows", () => {
    const days = buildTimelineDays({
      bookings: [
        {
          id: "a",
          code: "P2P-1",
          start: localIso(2026, 10, 31, 10),
          end: localIso(2026, 10, 31, 12),
          status: "CONFIRMED",
          userId: { name: "Asha" },
        },
        {
          id: "b",
          code: "P2P-2",
          start: localIso(2026, 10, 31, 14),
          end: localIso(2026, 10, 31, 16),
          status: "CANCELLED",
          userId: { name: "Skip" },
        },
        {
          id: "c",
          code: "P2P-3",
          start: localIso(2026, 11, 1, 9),
          end: localIso(2026, 11, 1, 11),
          status: "ACTIVE",
          userId: { name: "Ravi" },
        },
        {
          id: "d",
          code: "P2P-4",
          start: localIso(2026, 11, 1, 13),
          end: localIso(2026, 11, 1, 14),
          status: "EXPIRED",
        },
      ],
      spaceTitle: "Bandra basement",
    });

    assert.equal(days.length, 2);
    assert.equal(days[0]?.items.length, 1);
    assert.equal(days[0]?.items[0]?.title, "Asha");
    assert.equal(days[0]?.items[0]?.kind, "booking");
    assert.equal(days[1]?.items[0]?.title, "Ravi");
    assert.ok(days.every((day) => day.items.every((item) => item.status !== "CANCELLED" && item.status !== "EXPIRED")));
  });

  it("keeps overlapping same-day bookings in start-time order", () => {
    const days = buildTimelineDays({
      bookings: [
        {
          id: "late",
          code: "P2P-9",
          start: localIso(2026, 10, 31, 11),
          end: localIso(2026, 10, 31, 14),
          status: "CONFIRMED",
          userId: { name: "Late" },
        },
        {
          id: "early",
          code: "P2P-8",
          start: localIso(2026, 10, 31, 10),
          end: localIso(2026, 10, 31, 12),
          status: "ACTIVE",
          userId: { name: "Early" },
        },
      ],
    });
    assert.equal(days.length, 1);
    assert.deepEqual(
      days[0]?.items.map((item) => item.title),
      ["Early", "Late"]
    );
  });

  it("includes host-blocked periods as unavailable, not as bookings", () => {
    const days = buildTimelineDays({
      bookings: [],
      blocked: [
        {
          id: "blk",
          start: localIso(2026, 10, 31, 8),
          end: localIso(2026, 10, 31, 16),
          reason: "Family visiting",
        },
      ],
    });
    assert.equal(days.length, 1);
    assert.equal(days[0]?.items[0]?.kind, "block");
    assert.equal(days[0]?.items[0]?.title, "Blocked");
    assert.match(days[0]?.items[0]?.subtitle ?? "", /Family visiting/);
  });
});

describe("formatTimelineDate", () => {
  it("uses a long date with weekday, matching the sticky header pattern", () => {
    assert.match(formatTimelineDate("2026-10-31"), /October/);
    assert.match(formatTimelineDate("2026-10-31"), /\//);
  });
});
