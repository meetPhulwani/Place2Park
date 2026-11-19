import type { ListingDetail, ListingReview, SearchCenter, SpaceSummary } from "../types/listing";

export function validCoordinate(latitude: number | null, longitude: number | null): boolean {
  if (latitude == null || longitude == null) return false;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return false;
  if (latitude === 0 && longitude === 0) return false;
  return true;
}

export function parseSpaceSummary(value: unknown): SpaceSummary | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null;
  if (typeof value.pricePerHour !== "number" || !Number.isFinite(value.pricePerHour)) return null;
  const latitude = finite(value.latitude);
  const longitude = finite(value.longitude);
  return {
    id: value.id,
    title: value.title,
    area: text(value.area),
    city: text(value.city),
    locality: text(value.locality),
    displayLocation: text(value.displayLocation) || [text(value.area), text(value.city)].filter(Boolean).join(", "),
    latitude: validCoordinate(latitude, longitude) ? latitude : null,
    longitude: validCoordinate(latitude, longitude) ? longitude : null,
    pricePerHour: value.pricePerHour,
    ratingAvg: finite(value.ratingAvg) ?? 0,
    ratingCount: finite(value.ratingCount) ?? 0,
    covered: value.covered === true,
    evCharging: value.evCharging === true,
    cctv: value.cctv === true,
    verified: value.verified === true,
    vehicleTypes: text(value.vehicleTypes),
    level: text(value.level),
    propertyType: text(value.propertyType),
    imageUrl: typeof value.imageUrl === "string" && value.imageUrl ? value.imageUrl : null,
    distanceKm: finite(value.distanceKm),
    available: value.available === true ? true : value.available === false ? false : null,
  };
}

export function parseSearchPayload(value: unknown): { results: SpaceSummary[]; center: SearchCenter | null; resolvedArea: string | null } {
  if (!isRecord(value)) return { results: [], center: null, resolvedArea: null };
  const results = Array.isArray(value.results) ? value.results.flatMap((item) => {
    const parsed = parseSpaceSummary(item);
    return parsed ? [parsed] : [];
  }) : [];
  const centerRecord = isRecord(value.center) ? value.center : null;
  const lat = centerRecord ? finite(centerRecord.lat) : null;
  const lng = centerRecord ? finite(centerRecord.lng) : null;
  return {
    results,
    center: lat != null && lng != null ? { lat, lng } : null,
    resolvedArea: typeof value.resolvedArea === "string" && value.resolvedArea ? value.resolvedArea : null,
  };
}

export function markersFor(results: SpaceSummary[]) {
  return results.flatMap((space) =>
    validCoordinate(space.latitude, space.longitude)
      ? [{ id: space.id, latitude: space.latitude as number, longitude: space.longitude as number, title: space.title }]
      : []
  );
}

export function selectedListing(results: SpaceSummary[], selectedId: string | null) {
  if (!selectedId) return null;
  return results.find((space) => space.id === selectedId) ?? null;
}

export type ListPhase = "loading" | "error" | "empty" | "results";

export function listPhase(status: "pending" | "error" | "success", count: number): ListPhase {
  if (status === "pending") return "loading";
  if (status === "error") return "error";
  return count === 0 ? "empty" : "results";
}

export function greeting(name: string, hour: number): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return `${part}, ${first}`;
}

export function homeSections(nearby: SpaceSummary[], saved: SpaceSummary[]) {
  const nearbyCards = nearby.slice(0, 6);
  const shown = new Set(nearbyCards.slice(0, 3).map((space) => space.id));
  const recommended = [...nearby]
    .filter((space) => space.ratingCount > 0 && !shown.has(space.id))
    .sort((a, b) => b.ratingAvg - a.ratingAvg || b.ratingCount - a.ratingCount)
    .slice(0, 4);
  return { nearby: nearbyCards, recommended, saved: saved.slice(0, 4) };
}

export function vehicleLabels(vehicleTypes: string): string[] {
  return vehicleTypes
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item === "CAR" || item === "BIKE")
    .map((item) => (item === "CAR" ? "Car" : "Bike"));
}

export function amenityLabels(space: Pick<SpaceSummary, "covered" | "evCharging" | "cctv" | "verified">): string[] {
  const labels: string[] = [];
  if (space.covered) labels.push("Covered");
  if (space.evCharging) labels.push("EV charging");
  if (space.cctv) labels.push("CCTV");
  if (space.verified) labels.push("Verified");
  return labels;
}

const PROPERTY_LABELS: Record<string, string> = {
  INDIVIDUAL: "Individual",
  RESIDENTIAL_SOCIETY: "Residential society",
  DRIVEWAY: "Driveway",
  COMMERCIAL: "Commercial",
  OFFICE: "Office",
  HOTEL: "Hotel",
  BUSINESS: "Business",
  OTHER: "Other",
};

const LEVEL_LABELS: Record<string, string> = {
  BASEMENT: "Basement",
  GROUND: "Ground",
  PODIUM: "Podium",
  ROOFTOP: "Rooftop",
  STREET_LEVEL: "Street level",
};

export function propertyLabel(value: string): string {
  return PROPERTY_LABELS[value] ?? "";
}

export function levelLabel(value: string): string {
  return LEVEL_LABELS[value] ?? "";
}

export function parseListingDetail(value: unknown): ListingDetail | null {
  if (!isRecord(value) || !isRecord(value.space)) return null;
  const space = value.space;
  if (typeof space.id !== "string" || typeof space.title !== "string") return null;
  if (typeof space.pricePerHour !== "number") return null;
  const reveal = value.revealExactLocation === true;
  const latitude = finite(space.latitude);
  const longitude = finite(space.longitude);
  const images = Array.isArray(space.images)
    ? space.images.flatMap((image) => {
        if (!isRecord(image) || typeof image.url !== "string" || !image.url) return [];
        return [{ url: image.url, alt: typeof image.alt === "string" ? image.alt : "" }];
      })
    : [];
  const host = isRecord(value.host) ? value.host : null;
  const reviews = Array.isArray(value.reviews) ? value.reviews.flatMap(parseReview) : [];
  const amenities = [
    space.covered === true ? "Covered" : "",
    space.evCharging === true ? "EV charging" : "",
    space.cctv === true ? "CCTV" : "",
    space.securityGuard === true ? "Security guard" : "",
    space.gated === true ? "Gated" : "",
    space.overnightAllowed === true ? "Overnight parking" : "",
  ].filter(Boolean);
  return {
    id: space.id,
    title: space.title,
    description: text(space.description),
    displayLocation: text(space.displayLocation) || [text(space.area), text(space.city)].filter(Boolean).join(", "),
    address: reveal ? text(space.formattedAddress) || text(space.address) : "",
    latitude: validCoordinate(latitude, longitude) ? latitude : null,
    longitude: validCoordinate(latitude, longitude) ? longitude : null,
    pricePerHour: space.pricePerHour,
    ratingAvg: finite(space.ratingAvg) ?? 0,
    ratingCount: finite(space.ratingCount) ?? 0,
    propertyType: propertyLabel(text(space.propertyType)),
    spaceType: space.spaceType === "OPEN" ? "Open" : space.spaceType === "PRIVATE" ? "Private" : "",
    covered: space.covered === true,
    level: levelLabel(text(space.level)),
    vehicleTypes: vehicleLabels(text(space.vehicleTypes)),
    amenities,
    lengthFt: finite(space.lengthFt),
    widthFt: finite(space.widthFt),
    heightFt: finite(space.heightFt),
    vehicleSizeNotes: text(space.vehicleSizeNotes),
    accessInstructions: reveal ? text(space.accessInstructions) : "",
    rules: Array.isArray(space.rules) ? space.rules.filter((rule): rule is string => typeof rule === "string" && rule.trim().length > 0) : [],
    images,
    revealExactLocation: reveal,
    isFavorite: value.isFavorite === true,
    hostName: host && typeof host.name === "string" ? host.name : "Place2Park host",
    hostImage: host && typeof host.image === "string" ? host.image : "",
    reviews,
  };
}

function parseReview(value: unknown): ListingReview[] {
  if (!isRecord(value) || typeof value.rating !== "number") return [];
  const user = isRecord(value.user) ? value.user : null;
  return [
    {
      id: typeof value.id === "string" ? value.id : `${value.rating}-${text(value.comment)}`,
      rating: value.rating,
      comment: text(value.comment),
      author: user && typeof user.name === "string" && user.name ? user.name : "Driver",
    },
  ];
}

export function parseFavoriteSpaces(value: unknown): SpaceSummary[] {
  if (!isRecord(value) || !Array.isArray(value.spaces)) return [];
  return value.spaces.flatMap((item) => {
    const parsed = parseSpaceSummary(item);
    return parsed ? [parsed] : [];
  });
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
