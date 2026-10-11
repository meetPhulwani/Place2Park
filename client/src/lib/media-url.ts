/** Resolve listing media so /uploads and /demo work across hosts. */

export function apiAssetOrigin(apiBase: string): string {
  const base = apiBase.trim();
  if (!base || base.startsWith("/")) return "";
  try {
    return new URL(base).origin;
  } catch {
    return "";
  }
}

export function resolveMediaUrl(pathOrUrl: string | null | undefined, apiBase = "/api"): string {
  if (!pathOrUrl) return "";
  const raw = pathOrUrl.trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("data:") || raw.startsWith("blob:")) {
    return raw;
  }
  if (!raw.startsWith("/uploads") && !raw.startsWith("/demo")) {
    return raw;
  }
  const origin = apiAssetOrigin(apiBase);
  if (!origin) return raw;
  return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
}

export function mediaUrl(pathOrUrl: string | null | undefined): string {
  return resolveMediaUrl(pathOrUrl, import.meta.env.VITE_API_URL || "/api");
}
