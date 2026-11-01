/** Public site origins that may call the API from a browser. */
export const PRODUCTION_WEB_ORIGINS = ["https://www.place2park.me", "https://place2park.me"] as const;

const LOCAL_DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

/**
 * Allows the configured client, both production site hosts, and local Vite origins.
 * Localhost is not added in production.
 */
export function allowedCorsOrigins(clientUrl: string, nodeEnv: string): string[] {
  const origins = new Set<string>();
  const configured = String(clientUrl ?? "").trim().replace(/\/+$/, "");
  if (configured) origins.add(configured);
  for (const origin of PRODUCTION_WEB_ORIGINS) origins.add(origin);
  if (nodeEnv !== "production") {
    for (const origin of LOCAL_DEV_ORIGINS) origins.add(origin);
  }
  return [...origins];
}
