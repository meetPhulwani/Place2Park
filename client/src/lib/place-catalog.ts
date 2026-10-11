import { KNOWN_AREAS } from "@/lib/geo";
import { locationFromLabel } from "@/lib/location";
import type { ResolvedLocation } from "@/lib/google-maps";

export type LocalSuggestion = {
  id: string;
  mainText: string;
  secondaryText: string;
  lat: number;
  lng: number;
  source: "local";
};

const SECONDARY: Record<string, string> = {
  Shahad: "Kalyan, Maharashtra",
  Kalyan: "Thane, Maharashtra",
  "Kalyan West": "Kalyan, Maharashtra",
  Thane: "Maharashtra",
  Vashi: "Navi Mumbai, Maharashtra",
  Kurla: "Mumbai, Maharashtra",
  "Phoenix Marketcity Kurla": "Kurla, Mumbai",
  Andheri: "Mumbai, Maharashtra",
  "Andheri West": "Mumbai, Maharashtra",
  "Andheri East": "Mumbai, Maharashtra",
  "Bandra West": "Mumbai, Maharashtra",
  "Bandra Kurla Complex (BKC)": "Bandra East, Mumbai",
  Powai: "Mumbai, Maharashtra",
};

export function catalogSuggestions(query: string): LocalSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return KNOWN_AREAS.filter((area) => area.name.toLowerCase().includes(q)).slice(0, 8).map((area) => ({
    id: `local:${area.name}`,
    mainText: area.name,
    secondaryText: SECONDARY[area.name] ?? "Mumbai, Maharashtra",
    lat: area.lat,
    lng: area.lng,
    source: "local",
  }));
}

export function resolvedFromCatalog(place: Pick<LocalSuggestion, "mainText" | "secondaryText" | "lat" | "lng">): ResolvedLocation {
  const label = [place.mainText, place.secondaryText].filter(Boolean).join(", ");
  const parsed = locationFromLabel(label, place.lat, place.lng);
  return { ...parsed, pincode: parsed.postalCode };
}
