import { extractAddressComponents, type ParsedLocation } from "@/lib/location";

declare global {
  interface Window {
    google?: typeof google;
    __gmapsLoading?: Promise<void>;
  }
}

export function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return window.__gmapsLoading;
}

export function googleMapsApiKey(): string | undefined {
  const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  return key || undefined;
}

export type ResolvedLocation = ParsedLocation & { pincode: string };

export function resolvedLocationFromComponents(
  parts: {
    formattedAddress?: string;
    name?: string;
    placeId?: string;
    addressComponents?: google.maps.GeocoderAddressComponent[];
    latitude: number;
    longitude: number;
  }
): ResolvedLocation {
  const parsed = extractAddressComponents(parts);
  return { ...parsed, pincode: parsed.postalCode };
}

type PlaceText = string | { text?: string } | null | undefined;

function placeText(value: PlaceText): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  return value.text?.trim() ?? "";
}

export type IndiaPlaceSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

type PlacePredictionHandle = {
  placeId: string;
  mainText?: PlaceText;
  secondaryText?: PlaceText;
  text?: PlaceText;
  toPlace: () => {
    id?: string;
    displayName?: PlaceText;
    formattedAddress?: string;
    location?: { lat: () => number; lng: () => number } | null;
    addressComponents?: Array<{ longText?: string; shortText?: string; types?: string[] }>;
    fetchFields: (request: { fields: string[] }) => Promise<unknown>;
  };
};

type PlacesModule = {
  AutocompleteSessionToken: new () => object;
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions: (request: {
      input: string;
      includedRegionCodes?: string[];
      sessionToken?: object;
    }) => Promise<{ suggestions: Array<{ placePrediction?: PlacePredictionHandle | null }> }>;
  };
};

async function placesModule(): Promise<PlacesModule | null> {
  const apiKey = googleMapsApiKey();
  if (!apiKey || typeof window === "undefined") return null;
  try {
    await loadGoogleMaps(apiKey);
    const maps = window.google?.maps as { importLibrary?: (name: string) => Promise<PlacesModule> } | undefined;
    if (!maps?.importLibrary) return null;
    return await maps.importLibrary("places");
  } catch {
    return null;
  }
}

export type IndiaPlacePrediction = PlacePredictionHandle;

export type IndiaPlaceLookup = {
  status: "ok" | "empty" | "unavailable";
  suggestions: IndiaPlaceSuggestion[];
  sessionToken: object | null;
  predictions: Map<string, IndiaPlacePrediction>;
};

/** India-wide place suggestions. This is not a geocode and must stay behind the caller's debounce. */
export async function suggestIndiaPlaces(input: string, sessionToken?: object | null): Promise<IndiaPlaceLookup> {
  const query = input.trim();
  const unavailable: IndiaPlaceLookup = {
    status: "unavailable",
    suggestions: [],
    sessionToken: sessionToken ?? null,
    predictions: new Map(),
  };
  if (query.length < 2) return { ...unavailable, status: "empty" };
  const places = await placesModule();
  if (!places?.AutocompleteSuggestion?.fetchAutocompleteSuggestions) return unavailable;
  const token = sessionToken ?? new places.AutocompleteSessionToken();
  try {
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input: query,
      includedRegionCodes: ["in"],
      sessionToken: token,
    });
    const predictions = new Map<string, PlacePredictionHandle>();
    const items: IndiaPlaceSuggestion[] = [];
    for (const suggestion of suggestions ?? []) {
      const prediction = suggestion.placePrediction;
      if (!prediction?.placeId || predictions.has(prediction.placeId)) continue;
      const mainText = placeText(prediction.mainText) || placeText(prediction.text);
      if (!mainText) continue;
      predictions.set(prediction.placeId, prediction);
      items.push({
        placeId: prediction.placeId,
        mainText,
        secondaryText: placeText(prediction.secondaryText),
      });
      if (items.length >= 8) break;
    }
    return {
      status: items.length ? "ok" : "empty",
      suggestions: items,
      sessionToken: token,
      predictions,
    };
  } catch {
    return { ...unavailable, sessionToken: token };
  }
}

/** Place details for one selected suggestion. Coordinates come from that place, not a city table. */
export async function indiaPlaceSelection(prediction: IndiaPlacePrediction): Promise<ResolvedLocation | null> {
  try {
    const place = prediction.toPlace();
    await place.fetchFields({
      fields: ["id", "displayName", "formattedAddress", "location", "addressComponents"],
    });
    const lat = place.location?.lat?.();
    const lng = place.location?.lng?.();
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return resolvedLocationFromComponents({
      formattedAddress: place.formattedAddress?.trim() || placeText(place.displayName),
      name: placeText(place.displayName),
      placeId: place.id || prediction.placeId,
      addressComponents: (place.addressComponents ?? []).map((component) => ({
        long_name: component.longText ?? "",
        short_name: component.shortText ?? "",
        types: component.types ?? [],
      })) as google.maps.GeocoderAddressComponent[],
      latitude: lat,
      longitude: lng,
    });
  } catch {
    return null;
  }
}

/** Resolve a typed query once, on submit, using the first India suggestion. */
export async function resolveIndiaPlace(query: string): Promise<ResolvedLocation | null> {
  const found = await suggestIndiaPlaces(query);
  const first = found.predictions.values().next().value as PlacePredictionHandle | undefined;
  if (!first) return null;
  return indiaPlaceSelection(first);
}

export async function reverseGeocode(lat: number, lng: number): Promise<ResolvedLocation | null> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return null;
  await loadGoogleMaps(apiKey);
  if (!window.google?.maps?.Geocoder) return null;
  const geocoder = new google.maps.Geocoder();
  try {
    const { results } = await geocoder.geocode({ location: { lat, lng } });
    const first = results?.[0];
    if (!first) return null;
    return resolvedLocationFromComponents({
      formattedAddress: first.formatted_address,
      placeId: first.place_id,
      addressComponents: first.address_components,
      latitude: lat,
      longitude: lng,
    });
  } catch {
    return null;
  }
}
