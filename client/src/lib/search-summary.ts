export const MOBILE_PREVIEW_COUNT = 4;
export const RESULTS_PAGE_SIZE = 12;

export interface SearchFilterSummary {
  maxPrice?: number;
  maxDistanceKm?: number;
  covered?: boolean;
  ev?: boolean;
  vehicleType?: "CAR" | "BIKE";
  minRating?: number;
  sort?: "closest" | "cheapest" | "rating";
}

export function finiteCoord(value: string | null) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function hasDestinationCoords(lat: number | null, lng: number | null) {
  return lat != null && lng != null;
}

/**
 * The place the user actually picked. A formatted address wins over a single
 * locality token so the summary is not reduced to the first name in the address.
 */
export function selectedPlaceLabel(place: {
  formattedAddress?: string;
  sublocality?: string;
  locality?: string;
  area?: string;
  city?: string;
  state?: string;
}): string {
  const formatted = (place.formattedAddress ?? "").replace(/\s+/g, " ").trim();
  if (formatted && !/^(unknown|selected on map|pinned parking location|pinned location)$/i.test(formatted)) {
    return formatted;
  }
  const parts: string[] = [];
  for (const value of [place.sublocality, place.area, place.locality, place.city, place.state]) {
    const bit = (value ?? "").replace(/\s+/g, " ").trim();
    if (!bit) continue;
    if (parts.some((existing) => existing.localeCompare(bit, undefined, { sensitivity: "accent" }) === 0)) continue;
    parts.push(bit);
  }
  return parts.join(", ");
}

function localCalendarDate(value: string): Date | null {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]);
    const day = Number(dateOnly[3]);
    const local = new Date(year, month - 1, day);
    if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day) return null;
    return local;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatClock(date: Date) {
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** "Today · Monday, 2 November" or "Tuesday, 3 November". Null when no date was selected. */
export function formatSearchDateLabel(start: string | undefined, now = new Date()): string | null {
  if (!start) return null;
  const selected = localCalendarDate(start);
  if (!selected) return null;
  const weekday = selected.toLocaleDateString("en-IN", { weekday: "long" });
  const dayMonth = selected.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const line = `${weekday}, ${dayMonth}`;
  return sameLocalDay(selected, now) ? `Today · ${line}` : line;
}

/** "10:00 AM – 2:00 PM", or the start time alone when no duration was selected. */
export function formatSearchTimeLabel(start: string | undefined, durationMins?: number): string | null {
  if (!start || /^\d{4}-\d{2}-\d{2}$/.test(start.trim())) return null;
  const selected = localCalendarDate(start);
  if (!selected) return null;
  const startLabel = formatClock(selected);
  if (durationMins == null || !Number.isFinite(durationMins) || durationMins <= 0) return startLabel;
  return `${startLabel} – ${formatClock(new Date(selected.getTime() + durationMins * 60000))}`;
}

/** Compact label for filters that are actually narrowing the search. */
export function filterSummary(filters: SearchFilterSummary): string {
  const parts: string[] = [];
  if (filters.vehicleType === "CAR") parts.push("Car");
  if (filters.vehicleType === "BIKE") parts.push("Bike");
  if (filters.covered) parts.push("Covered");
  if (filters.ev) parts.push("EV");
  if (filters.maxPrice) parts.push(`Up to ₹${filters.maxPrice}/hr`);
  if (filters.maxDistanceKm) parts.push(`Within ${filters.maxDistanceKm} km`);
  if (filters.minRating) parts.push(`${filters.minRating}+ rating`);
  if (filters.sort === "cheapest") parts.push("Cheapest");
  if (filters.sort === "rating") parts.push("Top rated");
  return parts.join(" · ");
}
