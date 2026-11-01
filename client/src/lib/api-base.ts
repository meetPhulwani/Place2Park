/**
 * Vite inlines VITE_API_URL at build time.
 * Local dev uses the `/api` proxy. An absolute host must include the `/api` prefix
 * because Express mounts every route under `/api`.
 */
export function resolveApiBase(value: string | undefined | null): string {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "/api";
  if (trimmed.startsWith("/")) return trimmed;
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}
