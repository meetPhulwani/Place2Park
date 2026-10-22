// Application-level enums (DB stores strings; validate at the boundary).

export const ROLES = ["DRIVER", "HOST", "BOTH", "ADMIN"] as const;
export type Role = (typeof ROLES)[number];

export const BOOKING_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Statuses that occupy a slot (block double booking). */
export const BLOCKING_STATUSES = ["PENDING", "CONFIRMED", "ACTIVE"];

export const SPACE_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "VERIFIED",
  "ACTIVE",
  "PAUSED",
  "REJECTED",
  "HIDDEN",
] as const;
export type SpaceStatus = (typeof SPACE_STATUSES)[number];

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

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  INDIVIDUAL: "Individual spot",
  RESIDENTIAL_SOCIETY: "Residential society",
  DRIVEWAY: "Driveway",
  COMMERCIAL: "Commercial building",
  OFFICE: "Office",
  HOTEL: "Hotel",
  BUSINESS: "Business",
  OTHER: "Other",
};

export const LEVELS = ["BASEMENT", "GROUND", "PODIUM", "ROOFTOP", "STREET_LEVEL"] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABELS: Record<Level, string> = {
  BASEMENT: "Basement",
  GROUND: "Ground level",
  PODIUM: "Podium",
  ROOFTOP: "Rooftop",
  STREET_LEVEL: "Street level",
};

export const VEHICLE_TYPES = ["CAR", "BIKE"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

/** Allowed booking durations in minutes (server-enforced). */
export const ALLOWED_DURATIONS_MINS = [60, 120, 180, 240, 360, 480, 720, 1440] as const;

/** How far ahead a booking may start (days). */
export const MAX_ADVANCE_DAYS = 30;

/** Driver platform/service fee, charged on top of the base parking fee. */
export const SERVICE_FEE_PCT = 5;
/** Host commission taken from the base parking fee. Host net is 100 − this. */
export const PLATFORM_FEE_PCT = 10;

/** Minutes a PENDING booking holds the slot before expiring. */
export const PENDING_HOLD_MINS = 12;

/** Free-cancellation window: full refund if more than X mins before start. */
export const FREE_CANCEL_BEFORE_MINS = 60;

export const REPORT_REASONS = [
  "INCORRECT_INFO",
  "UNSAFE",
  "FRAUD",
  "UNAVAILABLE",
  "OTHER",
] as const;
export const REPORT_REASON_LABELS: Record<(typeof REPORT_REASONS)[number], string> = {
  INCORRECT_INFO: "Incorrect information",
  UNSAFE: "Felt unsafe",
  FRAUD: "Suspected fraud",
  UNAVAILABLE: "Space not available on arrival",
  OTHER: "Something else",
};

export const COMMON_RULES = [
  "Self-parking only — never hand over your keys",
  "No commercial vehicles",
  "No overnight parking",
  "No smoking",
  "Vehicle size limit applies",
  "Keep access lanes clear",
  "Follow security instructions",
] as const;
