export type SpaceCoordsSource = {
  latitude?: number | null;
  longitude?: number | null;
  location?: { coordinates?: number[] | null } | null;
} | null | undefined;

export function spaceCoordinates(space: SpaceCoordsSource): { lat: number; lng: number } | null {
  if (!space) return null;
  if (
    Number.isFinite(space.latitude) &&
    Number.isFinite(space.longitude) &&
    !(space.latitude === 0 && space.longitude === 0)
  ) {
    return { lat: space.latitude as number, lng: space.longitude as number };
  }
  const c = space.location?.coordinates;
  if (Array.isArray(c) && c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    if (c[0] === 0 && c[1] === 0) return null;
    return { lat: c[1]!, lng: c[0]! };
  }
  return null;
}
