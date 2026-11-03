/** Shared home-map camera. Both browsers use this until a granted fix arrives. */
export const FALLBACK_MAP_CENTER = { lat: 19.076, lng: 72.8777 };
export const FALLBACK_MAP_ZOOM = 13;

export type MapCenter = { lat: number; lng: number };
export type GeolocationPermission = "granted" | "denied" | "prompt" | "unknown";

/**
 * A granted permission uses the device fix. Prompt, denial, and a missing
 * Permissions API stay on the fallback so the map does not jump after load.
 */
export function cameraForPermission(
  permission: GeolocationPermission,
  position: MapCenter | null,
  fallback: MapCenter = FALLBACK_MAP_CENTER
): MapCenter {
  if (
    permission === "granted" &&
    position &&
    Number.isFinite(position.lat) &&
    Number.isFinite(position.lng)
  ) {
    return position;
  }
  return fallback;
}

/**
 * Home and other centred maps keep the requested camera.
 * A destination search still frames that place. A single unmarked pin still fits itself.
 */
export function shouldHoldMapCamera(hasDestination: boolean, hasCenter: boolean) {
  return !hasDestination && hasCenter;
}

export async function readGeolocationPermission(): Promise<GeolocationPermission> {
  const permissions = navigator.permissions;
  if (!permissions?.query) return "unknown";
  try {
    const status = await permissions.query({ name: "geolocation" });
    if (status.state === "granted" || status.state === "denied" || status.state === "prompt") return status.state;
  } catch {
    return "unknown";
  }
  return "unknown";
}

export function readCurrentPosition(options?: PositionOptions): Promise<MapCenter | null> {
  if (!navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      options
    );
  });
}

/** Resolve the first camera before the map is created. */
export async function resolveInitialMapCenter(): Promise<MapCenter> {
  const permission = await readGeolocationPermission();
  if (permission !== "granted") return FALLBACK_MAP_CENTER;
  const position = await readCurrentPosition({
    enableHighAccuracy: false,
    timeout: 4000,
    maximumAge: 300_000,
  });
  return cameraForPermission(permission, position);
}
