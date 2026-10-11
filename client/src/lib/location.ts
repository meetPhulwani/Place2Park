/**
 * Location parsing and display helpers.
 * Google `locality` is not always the city (e.g. a village vs the parent town).
 * No place names are hardcoded — callers pass Google components or stored fields.
 */

export type AddressComponentLike = {
  long_name: string;
  short_name?: string;
  types: string[];
};

export type ParsedLocation = {
  formattedAddress: string;
  address: string;
  locality: string;
  sublocality: string;
  area: string;
  city: string;
  district: string;
  state: string;
  postalCode: string;
  placeId: string;
  latitude: number;
  longitude: number;
};

export type DisplayLocationSource = {
  sublocality?: string | null;
  locality?: string | null;
  area?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
};

const PLACEHOLDER = new Set(["", "unknown", "selected on map", "pinned parking location", "pinned location"]);

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function sameName(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

function componentOf(components: AddressComponentLike[] | undefined, type: string) {
  return clean(components?.find((c) => c.types.includes(type))?.long_name);
}

function firstReal(...values: string[]) {
  return values.find((v) => v && !PLACEHOLDER.has(v.toLowerCase())) ?? "";
}

/**
 * Pull a stable hierarchy out of Google Geocoding / Places address_components.
 * Preserves Google's locality as `locality` even when it is not the city.
 */
export function extractAddressComponents(
  parts: {
    formattedAddress?: string;
    name?: string;
    placeId?: string;
    addressComponents?: AddressComponentLike[];
    latitude: number;
    longitude: number;
  }
): ParsedLocation {
  const c = parts.addressComponents;
  const sublocality = firstReal(
    componentOf(c, "sublocality_level_1"),
    componentOf(c, "sublocality_level_2"),
    componentOf(c, "sublocality"),
    componentOf(c, "neighborhood")
  );
  const locality = firstReal(componentOf(c, "locality"), componentOf(c, "postal_town"));
  const admin3 = firstReal(componentOf(c, "administrative_area_level_3"));
  const district = firstReal(componentOf(c, "administrative_area_level_2"));
  const state = firstReal(componentOf(c, "administrative_area_level_1"));
  const postalCode = componentOf(c, "postal_code");

  let city = "";
  let area = "";
  let storedLocality = locality;
  let storedSublocality = sublocality;

  if (sublocality && locality && !sameName(sublocality, locality)) {
    area = sublocality;
    city = locality;
  } else if (locality && admin3 && !sameName(locality, admin3)) {
    storedSublocality = storedSublocality || locality;
    area = locality;
    city = admin3;
  } else if (locality) {
    area = sublocality || locality;
    city = locality;
  } else {
    area = sublocality || admin3 || district;
    city = admin3 || district || state;
    storedLocality = storedLocality || city;
  }

  const formatted =
    clean(parts.formattedAddress) ||
    clean(parts.name) ||
    [area, city, state].filter(Boolean).join(", ") ||
    "Pinned location";

  return {
    formattedAddress: formatted,
    address: formatted,
    locality: storedLocality || city || area,
    sublocality: storedSublocality,
    area: area || city || storedLocality,
    city: city || storedLocality || area,
    district,
    state: state || district || city,
    postalCode,
    placeId: parts.placeId || "",
    latitude: parts.latitude,
    longitude: parts.longitude,
  };
}

/** Public, human-readable place line. Never returns coordinates, placeId, or a street address. */
export function getDisplayLocation(space: DisplayLocationSource): string {
  const sublocality = firstReal(clean(space.sublocality));
  const locality = firstReal(clean(space.locality));
  const area = firstReal(clean(space.area));
  const city = firstReal(clean(space.city));
  const district = firstReal(clean(space.district));
  const state = firstReal(clean(space.state));

  const primary = firstReal(sublocality, locality && city && !sameName(locality, city) ? locality : "", area, locality, city);
  const secondaryPool = primary && city && sameName(primary, city) ? [state, district] : [city, district, state];
  const secondary = secondaryPool.find((v) => v && !sameName(v, primary)) ?? "";

  if (primary && secondary) return `${primary}, ${secondary}`;
  return primary || city || district || state || "Pinned on the map";
}

/**
 * When Google Geocoder is unavailable, keep the name the host actually typed
 * instead of writing city=Unknown. No place names are hardcoded.
 */
export function locationFromLabel(label: string, latitude: number, longitude: number): ParsedLocation {
  const raw = clean(label);
  const bits = raw.split(",").map(clean).filter(Boolean);
  let postalCode = "";
  const tokens: string[] = [];
  for (const b of bits) {
    if (/^\d{6}$/.test(b)) postalCode = b;
    else tokens.push(b);
  }
  const primary = firstReal(tokens[0] ?? "") || "Selected on map";
  const city = firstReal(tokens[1] ?? "") || primary;
  const district = firstReal(tokens[2] ?? "");
  const state = firstReal(tokens[3] ?? tokens[2] ?? "");
  const formatted = raw.length >= 8 ? raw : [primary, city].filter((x, i, a) => x && a.indexOf(x) === i).join(", ");
  return {
    formattedAddress: formatted || primary,
    address: formatted || primary,
    locality: primary,
    sublocality: "",
    area: primary,
    city,
    district: district && !sameName(district, city) ? district : "",
    state: state && !sameName(state, city) && !sameName(state, primary) ? state : "",
    postalCode,
    placeId: "",
    latitude,
    longitude,
  };
}

/** Short destination label to send as the search `q` after a Places pick. */
export function shortSearchQuery(
  loc: Pick<ParsedLocation, "sublocality" | "locality" | "area" | "city" | "formattedAddress">
) {
  return firstReal(loc.sublocality, loc.locality, loc.area, loc.city, loc.formattedAddress);
}
