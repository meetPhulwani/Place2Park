/** Absolute API root, including `/api`. Expo inlines EXPO_PUBLIC_ values at bundle time. */
export function apiBaseUrl(value: string | undefined = process.env.EXPO_PUBLIC_API_URL): string {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\/.+/i.test(trimmed)) {
    throw new Error(
      "Set EXPO_PUBLIC_API_URL to the API origin, including /api. Development should point at your local API, not production, unless you set that URL yourself."
    );
  }
  // Express mounts every route under /api. A host-only value would call /auth/login and miss the route.
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}
