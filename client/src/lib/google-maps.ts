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
