/** Same-site path only. Rejects protocol-relative and external redirects. */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\") || value.includes("://") || value.includes("\0")) return fallback;
  return value;
}
