/** Haversine distance in km. */
export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Bounding box (degrees) around a point for a radius in km — cheap pre-filter before haversine. */
export function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

/** Well-known Mumbai areas used for destination search fallback (demo geocoder). */
export const KNOWN_AREAS: { name: string; lat: number; lng: number }[] = [
  { name: "Shahad", lat: 19.2478, lng: 73.1589 },
  { name: "Kalyan", lat: 19.2403, lng: 73.1305 },
  { name: "Kalyan West", lat: 19.2437, lng: 73.1225 },
  { name: "Thane", lat: 19.2183, lng: 72.9781 },
  { name: "Vashi", lat: 19.0771, lng: 72.9986 },
  { name: "Kurla", lat: 19.0726, lng: 72.8845 },
  { name: "Phoenix Marketcity Kurla", lat: 19.086, lng: 72.8888 },
  { name: "Andheri", lat: 19.1197, lng: 72.8464 },
  { name: "Bandra West", lat: 19.0596, lng: 72.8295 },
  { name: "Bandra Kurla Complex (BKC)", lat: 19.0653, lng: 72.8687 },
  { name: "Andheri West", lat: 19.1364, lng: 72.8296 },
  { name: "Andheri East", lat: 19.1178, lng: 72.8631 },
  { name: "Powai", lat: 19.1176, lng: 72.906 },
  { name: "Lower Parel", lat: 18.9982, lng: 72.8267 },
  { name: "Dadar", lat: 19.0178, lng: 72.8478 },
  { name: "Worli", lat: 19.0176, lng: 72.813 },
  { name: "Juhu", lat: 19.1075, lng: 72.8263 },
  { name: "Colaba", lat: 18.9067, lng: 72.8147 },
  { name: "Fort", lat: 18.9345, lng: 72.8352 },
  { name: "Malad West", lat: 19.1864, lng: 72.8402 },
];

export function geocodeKnownArea(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    KNOWN_AREAS.find((a) => a.name.toLowerCase() === q) ??
    KNOWN_AREAS.find((a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase())) ??
    null
  );
}

export function gmapsDirectionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
