// Application-level enums (DB stores strings; validated at the boundary).

export const ROLES = ["DRIVER", "HOST", "BOTH", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const BOOKING_STATUSES = ["PENDING", "CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a slot (block double booking). */
export const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "ACTIVE"];

export const SPACE_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "VERIFIED",
  "ACTIVE", // legacy live listings (treated as public/bookable)
  "PAUSED",
  "REJECTED",
  "HIDDEN",
] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

/** Listings that appear in public search and can be booked. */
export const PUBLIC_SPACE_STATUSES = ["VERIFIED", "ACTIVE"] as const;
export function isBookableStatus(status: string) {
  return (PUBLIC_SPACE_STATUSES as readonly string[]).includes(status);
}

export const PROPERTY_TYPES = [
  "INDIVIDUAL",
  "RESIDENTIAL_SOCIETY",
  "DRIVEWAY",
  "COMMERCIAL",
  "OFFICE",
  "HOTEL",
  "BUSINESS",
  "OTHER",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const LEVELS = ["BASEMENT", "GROUND", "PODIUM", "ROOFTOP", "STREET_LEVEL"] as const;
export type Level = (typeof LEVELS)[number];

export const VEHICLE_TYPES = ["CAR", "BIKE"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Allowed booking durations in minutes (server-enforced). */
export const ALLOWED_DURATIONS_MINS = [60, 120, 180, 240, 360, 480, 720, 1440] as const;

/** How far ahead a booking may start (days). */
export const MAX_ADVANCE_DAYS = 30;

/** Service fee charged to driver (percent of base). */
export const SERVICE_FEE_PCT = 5;
/** Platform commission taken from host (percent of base). */
export const PLATFORM_FEE_PCT = 15;

/** Minutes a PENDING booking holds the slot before expiring. */
export const PENDING_HOLD_MINS = 12;

/** Free-cancellation window: full refund if more than X mins before start. */
export const FREE_CANCEL_BEFORE_MINS = 60;

export const REPORT_REASONS = ["INCORRECT_INFO", "UNSAFE", "FRAUD", "UNAVAILABLE", "OTHER"] as const;
