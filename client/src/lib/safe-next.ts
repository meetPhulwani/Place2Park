const MENU_PREFIXES = ["/bookings", "/saved", "/payments", "/profile", "/settings", "/help", "/dashboard", "/history", "/host"];

function isAccountMenuPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return MENU_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Same-site path only. Login returns to the main page instead of an account menu page. */
export function safeNextPath(value: string | null | undefined, fallback = "/") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.includes("\\") || value.includes("://") || value.includes("\0")) return fallback;
  if (isAccountMenuPath(value)) return fallback;
  return value;
}
