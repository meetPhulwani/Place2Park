export type LocationAccess = "granted" | "denied" | "blocked" | "unknown";

export function locationAccess(status: string, canAskAgain: boolean | undefined): LocationAccess {
  if (status === "granted") return "granted";
  if (status === "denied" && canAskAgain === false) return "blocked";
  if (status === "denied") return "denied";
  return "unknown";
}

export function locationFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("disabled") || message.includes("unavailable") || message.includes("location services")) {
    return "Location is turned off on this device.";
  }
  return "Couldn't read your location. Search by area instead.";
}

export function settingsHint(access: LocationAccess): string | null {
  if (access === "blocked") return "Location is off for Place2Park. You can turn it on in device settings, or search by area.";
  if (access === "denied") return "Location was not allowed. Search by area, or try current location again.";
  return null;
}
