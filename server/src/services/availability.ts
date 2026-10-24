import type { ClientSession } from "mongoose";
import { Booking, BlockedSlot, ParkingSpace } from "../models/index.js";
import { ALLOWED_DURATIONS_MINS, BLOCKING_STATUSES, MAX_ADVANCE_DAYS, isBookableStatus } from "../utils/constants.js";

export type AvailabilityError =
  | "INVALID_DURATION"
  | "BELOW_MIN_DURATION"
  | "ABOVE_MAX_DURATION"
  | "IN_PAST"
  | "TOO_FAR_AHEAD"
  | "OUTSIDE_SCHEDULE"
  | "BLOCKED"
  | "CONFLICT"
  | "NOT_ACTIVE"
  | "OVERNIGHT_NOT_ALLOWED"
  | "DATE_BLOCKED";

export interface AvailabilityCheck {
  ok: boolean;
  error?: AvailabilityError;
}

export const AVAILABILITY_ERROR_MESSAGES: Record<AvailabilityError, string> = {
  INVALID_DURATION: "That duration isn't available. Choose one of the listed durations.",
  BELOW_MIN_DURATION: "This space requires a longer minimum booking.",
  ABOVE_MAX_DURATION: "This space doesn't allow bookings that long.",
  IN_PAST: "The start time is in the past.",
  TOO_FAR_AHEAD: `Bookings can be made up to ${MAX_ADVANCE_DAYS} days in advance.`,
  OUTSIDE_SCHEDULE: "The space isn't open during the selected time.",
  BLOCKED: "The host has blocked this period.",
  CONFLICT: "Parking is already booked for this time.",
  NOT_ACTIVE: "This listing isn't accepting bookings right now.",
  OVERNIGHT_NOT_ALLOWED: "Overnight parking isn't allowed at this space.",
  DATE_BLOCKED: "The host has marked this date unavailable.",
};

interface Rule {
  dayOfWeek: number;
  startMinute: number;
  endMinute: number;
}

interface SpaceForCheck {
  status: string;
  minDurationMins: number;
  maxDurationMins: number;
  availability: Rule[];
  overnightAllowed?: boolean;
  blockedDates?: string[];
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function datesInRange(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getTime() - 1); // end is exclusive of the last instant
  while (cursor <= last) {
    out.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Weekly-schedule coverage: every day touched by the window must cover its portion. */
export function coversWindow(rules: Rule[], start: Date, end: Date): boolean {
  if (rules.length === 0) return true; // no rules = 24/7
  let cursor = new Date(start);
  while (cursor < end) {
    const dayEnd = new Date(cursor);
    dayEnd.setHours(24, 0, 0, 0);
    const segEnd = dayEnd < end ? dayEnd : end;
    const day = cursor.getDay();
    const startMin = cursor.getHours() * 60 + cursor.getMinutes();
    const endMin =
      segEnd.getTime() === dayEnd.getTime() ? 1440 : segEnd.getHours() * 60 + segEnd.getMinutes();
    const covered = rules.some(
      (r) => r.dayOfWeek === day && r.startMinute <= startMin && r.endMinute >= endMin
    );
    if (!covered) return false;
    cursor = segEnd;
  }
  return true;
}

/** Validate requested window against listing config + weekly schedule (no DB queries). */
export function validateWindow(space: SpaceForCheck, start: Date, end: Date, now = new Date()): AvailabilityCheck {
  if (!isBookableStatus(space.status)) return { ok: false, error: "NOT_ACTIVE" };
  const durationMins = Math.round((end.getTime() - start.getTime()) / 60000);
  if (!(ALLOWED_DURATIONS_MINS as readonly number[]).includes(durationMins))
    return { ok: false, error: "INVALID_DURATION" };
  if (durationMins < space.minDurationMins) return { ok: false, error: "BELOW_MIN_DURATION" };
  if (durationMins > space.maxDurationMins) return { ok: false, error: "ABOVE_MAX_DURATION" };
  if (start.getTime() < now.getTime() - 5 * 60000) return { ok: false, error: "IN_PAST" };
  if (start.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 86400000)
    return { ok: false, error: "TOO_FAR_AHEAD" };
  const startMin = start.getHours() * 60 + start.getMinutes();
  if (!space.overnightAllowed && startMin + durationMins > 1440)
    return { ok: false, error: "OVERNIGHT_NOT_ALLOWED" };
  const blocked = new Set(space.blockedDates ?? []);
  if (datesInRange(start, end).some((d) => blocked.has(d))) return { ok: false, error: "DATE_BLOCKED" };
  if (!coversWindow(space.availability, start, end)) return { ok: false, error: "OUTSIDE_SCHEDULE" };
  return { ok: true };
}

/**
 * DB conflict check: overlapping blocking bookings or host-blocked slots.
 * Overlap rule: existing.start < requested.end AND existing.end > requested.start
 */
export async function hasConflict(
  spaceId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
  session?: ClientSession
): Promise<boolean> {
  const now = new Date();
  const conflict = await Booking.exists({
    spaceId,
    ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}),
    status: { $in: BLOCKING_STATUSES },
    start: { $lt: end },
    end: { $gt: start },
    $and: [
      // A PENDING booking only blocks while its payment hold is alive.
      { $or: [{ status: { $ne: "PENDING" } }, { expiresAt: { $gt: now } }] },
      // Refunded holds occupy only while the stay is actually in progress.
      { $or: [{ refunded: { $ne: true } }, { status: "ACTIVE" }] },
    ],
  }).session(session ?? null);
  if (conflict) return true;
  const blocked = await BlockedSlot.exists({ spaceId, start: { $lt: end }, end: { $gt: start } }).session(
    session ?? null
  );
  return !!blocked;
}

/** Full availability check (config + schedule + conflicts). */
export async function checkAvailability(spaceId: string, start: Date, end: Date): Promise<AvailabilityCheck> {
  const space = await ParkingSpace.findById(spaceId).select(
    "status minDurationMins maxDurationMins availability overnightAllowed blockedDates"
  );
  if (!space) return { ok: false, error: "NOT_ACTIVE" };
  const windowCheck = validateWindow(space, start, end);
  if (!windowCheck.ok) return windowCheck;
  if (await hasConflict(spaceId, start, end)) return { ok: false, error: "CONFLICT" };
  return { ok: true };
}

/** Expire stale PENDING bookings (called lazily before availability-sensitive reads). */
export async function expireStalePendingBookings(spaceId?: string): Promise<string[]> {
  const filter = { status: "PENDING", expiresAt: { $lt: new Date() }, ...(spaceId ? { spaceId } : {}) };
  const doomed = await Booking.find(filter).select("_id");
  if (doomed.length) await Booking.updateMany({ _id: { $in: doomed.map((row) => row._id) } }, { $set: { status: "EXPIRED" } });
  return doomed.map((row) => String(row._id));
}

async function applyProgress(filter: Record<string, unknown>) {
  const now = new Date();
  await Booking.updateMany(
    { ...filter, status: "CONFIRMED", refunded: true, start: { $lte: now } },
    { $set: { status: "CANCELLED" } }
  );
  await Booking.updateMany(
    { ...filter, status: "CONFIRMED", refunded: { $ne: true }, start: { $lte: now }, end: { $gt: now } },
    { $set: { status: "ACTIVE" } }
  );
  await Booking.updateMany(
    { ...filter, status: { $in: ["CONFIRMED", "ACTIVE"] }, end: { $lte: now } },
    { $set: { status: "COMPLETED" } }
  );
}

/** Apply expiry + time progression for one booking (any viewer). */
export async function progressOneBooking(bookingId: string) {
  const now = new Date();
  await Booking.updateOne(
    { _id: bookingId, status: "PENDING", expiresAt: { $lt: now } },
    { $set: { status: "EXPIRED" } }
  );
  await applyProgress({ _id: bookingId });
}

/** Lazily progress booking statuses: CONFIRMED→ACTIVE→COMPLETED by time. */
export async function progressBookingStatuses(userId?: string, hostId?: string, spaceId?: string) {
  const scope = userId ? { userId } : hostId ? { hostId } : spaceId ? { spaceId } : {};
  await applyProgress(scope);
}

export async function progressSpaceBookings(spaceId: string) {
  await progressBookingStatuses(undefined, undefined, spaceId);
}
