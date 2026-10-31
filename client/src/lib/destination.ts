import { geocodeKnownArea, haversineKm } from "./geo";
import { googleMapsApiKey, loadGoogleMaps, resolvedLocationFromComponents } from "./google-maps";
import { formatDistance } from "./utils";

export type DestinationFix = {
  latitude: number;
  longitude: number;
  label: string;
};

/** Straight-line label. Never invents a number when the distance is unknown. */
export function straightLineLabel(km: number | null | undefined): string | null {
  if (km == null || !Number.isFinite(km) || km < 0) return null;
  return `${formatDistance(km)} straight line`;
}

/** Existing locality catalog. Not a stand-in for an arbitrary city. */
export function knownDestination(query: string): DestinationFix | null {
  const area = geocodeKnownArea(query);
  if (!area) return null;
  return { latitude: area.lat, longitude: area.lng, label: area.name };
}

export function viewportPoints(
  destination: { lat: number; lng: number } | null,
  markers: { lat: number; lng: number }[]
) {
  const points = markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
  if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
    points.push({ lat: destination.lat, lng: destination.lng });
  }
  return points;
}

export type MapOcclusion = { left: number; top: number; right: number; bottom: number };

const CLEAR_OCCLUSION: MapOcclusion = { left: 0, top: 0, right: 0, bottom: 0 };

/** How much of the map the results card covers, in pixels from each edge. */
export function occlusionFromRects(
  map: { left: number; top: number; right: number; bottom: number },
  sheet: { left: number; top: number; right: number; bottom: number } | null
): MapOcclusion {
  if (!sheet) return CLEAR_OCCLUSION;
  const mapWidth = map.right - map.left;
  const mapHeight = map.bottom - map.top;
  const sheetWidth = sheet.right - sheet.left;
  const sheetHeight = sheet.bottom - sheet.top;
  if (mapWidth < 20 || mapHeight < 20 || sheetWidth < 8 || sheetHeight < 8) return CLEAR_OCCLUSION;

  const gap = 12;
  const next = { ...CLEAR_OCCLUSION };
  if (sheet.left <= map.left + 32 && sheet.right < map.right - 48) {
    next.left = Math.min(mapWidth - 180, Math.max(0, sheet.right - map.left + gap));
  }
  if (sheet.bottom >= map.bottom - 32 && sheet.top > map.top + 48) {
    next.bottom = Math.min(mapHeight - 180, Math.max(0, map.bottom - sheet.top + gap));
  }
  return next;
}

/**
 * Pan, in pixels, that moves a pin from the map centre into the uncovered area.
 * Positive x pans the camera east (pin moves left). Positive y pans south (pin moves up).
 */
export function destinationPan(mapWidth: number, mapHeight: number, occlusion?: Partial<MapOcclusion>) {
  const left = Math.max(0, occlusion?.left ?? 0);
  const top = Math.max(0, occlusion?.top ?? 0);
  const right = Math.max(0, occlusion?.right ?? 0);
  const bottom = Math.max(0, occlusion?.bottom ?? 0);
  const width = Math.max(mapWidth, 1);
  const height = Math.max(mapHeight, 1);
  const visibleW = Math.max(width - left - right, 1);
  const visibleH = Math.max(height - top - bottom, 1);
  return {
    x: Math.round(width / 2 - (left + visibleW / 2)),
    y: Math.round(height / 2 - (top + visibleH / 2)),
    viewportPx: Math.min(visibleW, visibleH),
  };
}

/** Spaces farther than this stay on the map, but they do not pull the camera out to city scale. */
export const NEIGHBOURHOOD_KM = 2.2;
const FRAME_PADDING_PX = 72;
const M_PER_PX_AT_ZOOM_0 = 156543.03392;

function finiteMarkers(markers: { lat: number; lng: number }[]) {
  return markers.filter((marker) => Number.isFinite(marker.lat) && Number.isFinite(marker.lng));
}

/** Web Mercator zoom that keeps `radiusM` inside half of the usable viewport. */
export function zoomToFitRadius(lat: number, radiusM: number, viewportPx: number, paddingPx = FRAME_PADDING_PX) {
  const side = Number.isFinite(viewportPx) && viewportPx >= 160 ? viewportPx : 640;
  const half = Math.max(side - paddingPx * 2, 160) / 2;
  const metresPerPixel = Math.max(radiusM, 80) / half;
  const latScale = Math.cos((lat * Math.PI) / 180);
  return Math.log2((M_PER_PX_AT_ZOOM_0 * latScale) / metresPerPixel);
}

/**
 * Centre on the searched place at neighbourhood zoom (15–16).
 * Include parking that still fits at that zoom. If the closest space is farther,
 * widen only enough to show it, and never past zoom 14.
 */
export function frameDestinationView(
  destination: { lat: number; lng: number },
  markers: { lat: number; lng: number }[],
  viewportPx: number
) {
  const center = { lat: destination.lat, lng: destination.lng };
  const nearby = finiteMarkers(markers)
    .map((marker) => ({
      ...marker,
      km: haversineKm(destination.lat, destination.lng, marker.lat, marker.lng),
    }))
    .filter((marker) => marker.km <= NEIGHBOURHOOD_KM)
    .sort((a, b) => a.km - b.km);

  const kept: { lat: number; lng: number; km: number }[] = [];
  for (const marker of nearby) {
    const zoom = zoomToFitRadius(destination.lat, marker.km * 1000, viewportPx);
    if (kept.length > 0 && zoom < 15) break;
    kept.push(marker);
  }

  if (kept.length === 0) {
    return { center, zoom: 15, points: [center] };
  }

  const farthestM = kept[kept.length - 1]!.km * 1000;
  let zoom = zoomToFitRadius(destination.lat, farthestM, viewportPx);
  zoom = zoom >= 15 ? Math.min(16, Math.max(15, zoom)) : Math.max(14, zoom);
  zoom = Math.round(Math.min(16, zoom) * 10) / 10;
  return {
    center,
    zoom,
    points: [...kept.map(({ lat, lng }) => ({ lat, lng })), center],
  };
}

async function geocodeWithGoogle(query: string): Promise<DestinationFix | null> {
  const apiKey = googleMapsApiKey();
  if (!apiKey || typeof window === "undefined") return null;
  await loadGoogleMaps(apiKey);
  const Geocoder = window.google?.maps?.Geocoder;
  if (!Geocoder) return null;
  const geocoder = new Geocoder();
  const { results } = await geocoder.geocode({
    address: query,
    componentRestrictions: { country: "IN" },
  });
  const first = results?.[0];
  const loc = first?.geometry?.location;
  if (!first || !loc) return null;
  const parsed = resolvedLocationFromComponents({
    formattedAddress: first.formatted_address,
    name: first.formatted_address,
    placeId: first.place_id,
    addressComponents: first.address_components,
    latitude: loc.lat(),
    longitude: loc.lng(),
  });
  return {
    latitude: parsed.latitude,
    longitude: parsed.longitude,
    label: parsed.formattedAddress || query,
  };
}

/**
 * Resolve a typed destination to real coordinates.
 * Google Geocoding wins when it returns a place; the locality catalog is only a fallback.
 */
export async function resolveDestinationQuery(
  query: string,
  lookup: (query: string) => Promise<DestinationFix | null> = geocodeWithGoogle
): Promise<DestinationFix | null> {
  const q = query.trim();
  if (q.length < 2) return null;
  try {
    const found = await lookup(q);
    if (found && Number.isFinite(found.latitude) && Number.isFinite(found.longitude)) return found;
  } catch {
    // Fall through to the catalog when the geocoder is unavailable.
  }
  return knownDestination(q);
}
