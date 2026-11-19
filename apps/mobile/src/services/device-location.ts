import * as Location from "expo-location";
import { locationAccess, locationFailureMessage, settingsHint, type LocationAccess } from "../lib/location-access";

export type CurrentLocation =
  | { ok: true; lat: number; lng: number }
  | { ok: false; access: LocationAccess; message: string };

export async function readCurrentLocation(): Promise<CurrentLocation> {
  const permission = await Location.requestForegroundPermissionsAsync();
  const access = locationAccess(permission.status, permission.canAskAgain);
  if (access !== "granted") {
    return { ok: false, access, message: settingsHint(access) ?? "Location was not allowed." };
  }
  try {
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return { ok: false, access: "granted", message: "Couldn't read your location. Search by area instead." };
    }
    return { ok: true, lat, lng };
  } catch (error) {
    return { ok: false, access: "granted", message: locationFailureMessage(error) };
  }
}
