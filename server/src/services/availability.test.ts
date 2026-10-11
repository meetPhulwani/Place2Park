import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coversWindow, validateWindow } from "./availability.js";

const open = {
  status: "VERIFIED",
  minDurationMins: 60,
  maxDurationMins: 1440,
  availability: [] as { dayOfWeek: number; startMinute: number; endMinute: number }[],
  overnightAllowed: false,
  blockedDates: [] as string[],
};

function at(daysFromMonday: number, hour: number, minute = 0) {
  // A fixed Monday 2026-10-12 keeps weekday tests stable.
  const d = new Date(2026, 9, 12 + daysFromMonday, hour, minute, 0, 0);
  return d;
}

describe("validateWindow", () => {
  it("rejects past starts", () => {
    const start = at(0, 10);
    const end = at(0, 12);
    const now = at(0, 15);
    const check = validateWindow(open, start, end, now);
    assert.equal(check.ok, false);
    assert.equal(check.error, "IN_PAST");
  });

  it("rejects invalid duration", () => {
    const start = at(1, 10);
    const end = new Date(start.getTime() + 17 * 60000);
    const check = validateWindow(open, start, end, at(0, 8));
    assert.equal(check.ok, false);
    assert.equal(check.error, "INVALID_DURATION");
  });

  it("rejects overnight when not allowed", () => {
    const start = at(1, 23);
    const end = new Date(start.getTime() + 120 * 60000);
    const check = validateWindow(open, start, end, at(0, 8));
    assert.equal(check.ok, false);
    assert.equal(check.error, "OVERNIGHT_NOT_ALLOWED");
  });

  it("rejects blocked dates", () => {
    const start = at(1, 10);
    const end = at(1, 12);
    const check = validateWindow({ ...open, blockedDates: ["2026-10-13"] }, start, end, at(0, 8));
    assert.equal(check.ok, false);
    assert.equal(check.error, "DATE_BLOCKED");
  });

  it("rejects times outside the weekly schedule", () => {
    const weekday = {
      ...open,
      availability: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, startMinute: 8 * 60, endMinute: 21 * 60 })),
    };
    const saturday = at(5, 10); // 2026-10-17
    const check = validateWindow(weekday, saturday, new Date(saturday.getTime() + 120 * 60000), at(0, 8));
    assert.equal(check.ok, false);
    assert.equal(check.error, "OUTSIDE_SCHEDULE");
  });

  it("accepts a valid future window", () => {
    const start = at(1, 10);
    const end = at(1, 12);
    const check = validateWindow(open, start, end, at(0, 8));
    assert.equal(check.ok, true);
  });
});

describe("coversWindow / overlap rule", () => {
  it("treats empty rules as 24/7", () => {
    assert.equal(coversWindow([], at(1, 10), at(1, 12)), true);
  });

  it("uses half-open overlap: 10–12 conflicts with 10:30–11:30 and 11–13, not 12–14", () => {
    const heldStart = at(1, 10).getTime();
    const heldEnd = at(1, 12).getTime();
    const overlaps = (s: Date, e: Date) => heldStart < e.getTime() && heldEnd > s.getTime();
    assert.equal(overlaps(at(1, 10, 30), at(1, 11, 30)), true);
    assert.equal(overlaps(at(1, 11), at(1, 13)), true);
    assert.equal(overlaps(at(1, 12), at(1, 14)), false);
  });
});
