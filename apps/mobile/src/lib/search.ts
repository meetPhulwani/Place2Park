import type { PlacePrediction, SearchDraft, SeekerSort, SpaceSummary } from "../types/listing";

const ALLOWED_DURATIONS = new Set([60, 120, 180, 240, 360, 480, 720, 1440]);

export function searchQuery(draft: SearchDraft): string {
  const params = new URLSearchParams();
  const q = draft.q?.trim();
  if (q) params.set("q", q.slice(0, 120));
  if (isCoord(draft.lat) && isCoord(draft.lng)) {
    params.set("lat", String(draft.lat));
    params.set("lng", String(draft.lng));
  }
  if (draft.maxPrice != null && draft.maxPrice >= 0 && draft.maxPrice <= 100_000) params.set("maxPrice", String(draft.maxPrice));
  if (draft.maxDistanceKm != null && draft.maxDistanceKm > 0 && draft.maxDistanceKm <= 12) {
    params.set("maxDistanceKm", String(draft.maxDistanceKm));
  }
  if (draft.covered) params.set("covered", "true");
  if (draft.ev) params.set("ev", "true");
  if (draft.vehicleType === "CAR" || draft.vehicleType === "BIKE") params.set("vehicleType", draft.vehicleType);
  if (draft.minRating != null && draft.minRating >= 1 && draft.minRating <= 5) params.set("minRating", String(draft.minRating));
  const apiSort = draft.sort === "cheapest" || draft.sort === "rating" ? draft.sort : undefined;
  if (apiSort) params.set("sort", apiSort);
  if (draft.start && draft.durationMins != null && ALLOWED_DURATIONS.has(draft.durationMins)) {
    params.set("start", draft.start);
    params.set("durationMins", String(draft.durationMins));
  }
  return params.toString();
}

export function draftFromParams(params: Record<string, string | undefined>): SearchDraft {
  const lat = numberParam(params.lat);
  const lng = numberParam(params.lng);
  const maxPrice = numberParam(params.maxPrice);
  const maxDistanceKm = numberParam(params.maxDistanceKm);
  const minRating = numberParam(params.minRating);
  const durationMins = numberParam(params.durationMins);
  const sort = params.sort;
  return {
    q: params.q || undefined,
    lat,
    lng,
    label: params.label || undefined,
    maxPrice,
    maxDistanceKm,
    covered: params.covered === "true",
    ev: params.ev === "true",
    vehicleType: params.vehicleType === "CAR" || params.vehicleType === "BIKE" ? params.vehicleType : undefined,
    minRating,
    sort: sort === "cheapest" || sort === "rating" || sort === "highest-price" || sort === "closest" ? sort : undefined,
    start: params.start || undefined,
    durationMins,
  };
}

function numberParam(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isCoord(value: number | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function applyReturnedSort(results: SpaceSummary[], sort: SeekerSort | undefined): SpaceSummary[] {
  if (sort !== "highest-price") return results;
  return [...results].sort((a, b) => b.pricePerHour - a.pricePerHour);
}

export function parsePredictions(value: unknown): PlacePrediction[] {
  if (!isRecord(value) || !Array.isArray(value.predictions)) return [];
  return value.predictions.flatMap((item) => {
    if (!isRecord(item)) return [];
    if (typeof item.id !== "string" || typeof item.mainText !== "string") return [];
    if (typeof item.lat !== "number" || typeof item.lng !== "number") return [];
    if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) return [];
    return [
      {
        id: item.id,
        mainText: item.mainText,
        secondaryText: typeof item.secondaryText === "string" ? item.secondaryText : "",
        lat: item.lat,
        lng: item.lng,
      },
    ];
  });
}

export function createRecentSearches(limit = 8) {
  const items: string[] = [];
  return {
    add(query: string) {
      const next = query.trim();
      if (next.length < 2) return;
      const without = items.filter((item) => item.toLowerCase() !== next.toLowerCase());
      items.splice(0, items.length, next, ...without.slice(0, limit - 1));
    },
    list() {
      return [...items];
    },
    clear() {
      items.splice(0, items.length);
    },
  };
}

export function createSearchDebounce(waitMs: number, schedule: (fn: () => void, ms: number) => unknown, cancel: (id: unknown) => void) {
  let timer: unknown = null;
  let generation = 0;
  return {
    run(action: () => void) {
      if (timer != null) cancel(timer);
      const current = ++generation;
      timer = schedule(() => {
        timer = null;
        if (current === generation) action();
      }, waitMs);
    },
    cancel() {
      generation += 1;
      if (timer != null) cancel(timer);
      timer = null;
    },
  };
}

export const sessionSearches = createRecentSearches();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
