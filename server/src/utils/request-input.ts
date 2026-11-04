import { ALLOWED_DURATIONS_MINS, BOOKING_STATUSES, PAYOUT_STATUSES, SPACE_STATUSES } from "./constants.js";

const HISTORY_STATUSES = ["COMPLETED", "CANCELLED", "EXPIRED"] as const;

/** Accept only a plain number or numeric string. Objects never become query operators. */
export function finiteQueryNumber(...candidates: unknown[]): number | undefined {
  for (const value of candidates) {
    if (typeof value !== "string" && typeof value !== "number") continue;
    if (typeof value === "string" && (value.length === 0 || value.length > 20)) continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function boundedText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function allowlisted<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function historyBookingStatus(value: unknown): (typeof HISTORY_STATUSES)[number] | undefined {
  if (value === "ALL") return undefined;
  return allowlisted(value, HISTORY_STATUSES);
}

export function bookingStatus(value: unknown): (typeof BOOKING_STATUSES)[number] | undefined {
  if (value === "ALL") return undefined;
  return allowlisted(value, BOOKING_STATUSES);
}

export function listingStatus(value: unknown): (typeof SPACE_STATUSES)[number] | undefined {
  if (value === "ALL") return undefined;
  return allowlisted(value, SPACE_STATUSES);
}

export function payoutStatus(value: unknown): (typeof PAYOUT_STATUSES)[number] | undefined {
  if (value === "ALL") return undefined;
  return allowlisted(value, PAYOUT_STATUSES);
}

/** Date-only or ISO timestamp. Invalid dates stay out of Mongo range filters. */
export function dayQuery(value: unknown, endOfDay = false): Date | undefined {
  if (typeof value !== "string" || value.length > 40) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(endOfDay ? `${value}T23:59:59.999` : value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function pageQuery(value: unknown, max = 1000): number {
  const n = finiteQueryNumber(value);
  if (n == null) return 1;
  return Math.min(max, Math.max(1, Math.floor(n)));
}

export function calendarMonth(year: unknown, month: unknown, now = new Date()) {
  const y = finiteQueryNumber(year);
  const m = finiteQueryNumber(month);
  return {
    year: y != null && Number.isInteger(y) && y >= 2020 && y <= 2100 ? y : now.getFullYear(),
    month: m != null && Number.isInteger(m) && m >= 0 && m <= 11 ? m : now.getMonth(),
  };
}

export function publicSearchInput(q: Record<string, unknown>) {
  let lat = finiteQueryNumber(q.lat, q.latitude);
  let lng = finiteQueryNumber(q.lng, q.longitude);
  if (lat != null && (lat < -90 || lat > 90)) lat = undefined;
  if (lng != null && (lng < -180 || lng > 180)) lng = undefined;
  const durationRaw = finiteQueryNumber(q.durationMins);
  const durationMins =
    durationRaw != null && (ALLOWED_DURATIONS_MINS as readonly number[]).includes(durationRaw) ? durationRaw : undefined;
  const startRaw = typeof q.start === "string" && q.start.length <= 40 ? new Date(q.start) : undefined;
  const start = startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : undefined;
  const maxPrice = finiteQueryNumber(q.maxPrice);
  const minRatingRaw = finiteQueryNumber(q.minRating);
  const maxDistanceKm = finiteQueryNumber(q.maxDistanceKm, q.radius, q.radiusKm);
  const text = boundedText(q.q, 120);
  const vehicleType: "CAR" | "BIKE" | undefined =
    q.vehicleType === "CAR" || q.vehicleType === "BIKE" ? q.vehicleType : undefined;
  const sort: "closest" | "cheapest" | "rating" =
    q.sort === "cheapest" || q.sort === "rating" ? q.sort : "closest";
  return {
    q: text || undefined,
    lat,
    lng,
    start,
    durationMins,
    maxPriceRupees: maxPrice != null && maxPrice >= 0 && maxPrice <= 100_000 ? maxPrice : undefined,
    maxDistanceKm: maxDistanceKm != null && maxDistanceKm > 0 ? maxDistanceKm : undefined,
    covered: q.covered === "true" || q.covered === "1",
    ev: q.ev === "true" || q.ev === "1",
    vehicleType,
    minRating: minRatingRaw != null && minRatingRaw >= 0 && minRatingRaw <= 5 ? minRatingRaw : undefined,
    sort,
  };
}
