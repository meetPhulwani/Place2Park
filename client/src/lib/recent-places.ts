import type { Booking, BookingSpaceRef } from "../types/index.js";
import { getDisplayLocation } from "./location.js";
import { spaceCoordinates } from "./space-coords.js";

const KEY = "parkly.recentPlaces";
const MAX_STORED = 8;
const MAX_SHOWN = 2;

export type RecentPlace = {
  label: string;
  q: string;
  lat?: number;
  lng?: number;
  city?: string;
  imageUrl?: string | null;
  at: number;
  source: "search" | "booking";
};

function clean(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function keyOf(place: Pick<RecentPlace, "label" | "q">) {
  return (clean(place.q) || clean(place.label)).toLowerCase();
}

export function upsertRecent(list: RecentPlace[], place: RecentPlace, max = MAX_STORED): RecentPlace[] {
  const label = clean(place.label);
  const q = clean(place.q) || label;
  if (!label) return list.slice(0, max);
  const incoming: RecentPlace = { ...place, label, q };
  const id = keyOf(incoming);
  return [incoming, ...list.filter((item) => keyOf(item) !== id)].slice(0, max);
}

export function pickRecentPlaces(went: RecentPlace[], searched: RecentPlace[], limit = MAX_SHOWN): RecentPlace[] {
  const out: RecentPlace[] = [];
  const seen = new Set<string>();
  for (const place of [...went, ...searched]) {
    const id = keyOf(place);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(place);
    if (out.length >= limit) break;
  }
  return out;
}

export function recentPlaceFromBooking(booking: Pick<Booking, "start" | "spaceId">): RecentPlace | null {
  if (!booking.spaceId || typeof booking.spaceId !== "object") return null;
  const space = booking.spaceId as BookingSpaceRef;
  const label = clean(space.area) || getDisplayLocation(space);
  if (!label) return null;
  const city = clean(space.city);
  const coords = spaceCoordinates(space);
  const at = new Date(booking.start).getTime();
  return {
    label,
    q: clean(space.area) || label,
    lat: coords?.lat,
    lng: coords?.lng,
    city: city && city.toLowerCase() !== label.toLowerCase() ? city : undefined,
    imageUrl: space.images?.[0]?.url ?? null,
    at: Number.isFinite(at) ? at : 0,
    source: "booking",
  };
}

function readStore(): RecentPlace[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentPlace[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.label === "string" && typeof p.q === "string");
  } catch {
    return [];
  }
}

function writeStore(list: RecentPlace[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode */
  }
}

export function readRecentPlaces(): RecentPlace[] {
  return readStore();
}

export function rememberPlace(place: Omit<RecentPlace, "at" | "source"> & { source?: RecentPlace["source"] }): RecentPlace[] {
  const next = upsertRecent(readStore(), {
    ...place,
    source: place.source ?? "search",
    at: Date.now(),
  });
  writeStore(next);
  return next;
}
