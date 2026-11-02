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
