/** GA4 measurement IDs look like G-XXXXXXXXXX. Anything else is ignored. */
const MEASUREMENT_ID = /^G-[A-Z0-9]{4,32}$/;

const SENSITIVE_KEY =
  /password|email|phone|token|otp|secret|auth|cookie|credential|account|ifsc|bank|plate|name|address|cvv|pin|upi|pan\b/i;

export function measurementId(value: string | undefined | null): string | null {
  const id = String(value ?? "").trim().toUpperCase();
  return MEASUREMENT_ID.test(id) ? id : null;
}

export function browserPrivacyOptOut(
  nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } | null | undefined
): boolean {
  if (!nav) return false;
  if (nav.globalPrivacyControl === true) return true;
  const dnt = String(nav.doNotTrack ?? "").toLowerCase();
  return dnt === "1" || dnt === "yes";
}

export function analyticsAllowed(input: {
  production: boolean;
  measurementId: string | null;
  console: boolean;
  privacyOptOut: boolean;
}): boolean {
  return analyticsSkipReason(input) == null;
}

export type AnalyticsSkipReason = "not-production" | "missing-measurement-id" | "admin-console" | "privacy-opt-out";

export function analyticsSkipReason(input: {
  production: boolean;
  measurementId: string | null;
  console: boolean;
  privacyOptOut: boolean;
}): AnalyticsSkipReason | null {
  if (!input.production) return "not-production";
  if (!input.measurementId) return "missing-measurement-id";
  if (input.console) return "admin-console";
  if (input.privacyOptOut) return "privacy-opt-out";
  return null;
}

/** gtag.js only treats Arguments objects as config/event commands. A plain array is ignored. */
export function isRecognizedGtagCommand(command: unknown): boolean {
  if (command == null || typeof command !== "object") return false;
  const record = command as { event?: unknown };
  if (record.event) return true;
  const isArguments =
    Object.prototype.toString.call(command) === "[object Arguments]" ||
    Object.prototype.hasOwnProperty.call(command, "callee");
  if (!isArguments) return false;
  const name = (command as ArrayLike<unknown>)[0];
  return name === "config" || name === "event" || name === "js" || name === "get";
}

export function googleTagSrc(id: string | null): string | null {
  if (!id) return null;
  return `https://www.googletagmanager.com/gtag/js?id=${id}`;
}

/** Path only. Query strings can carry reset tokens and must not be sent. */
export function analyticsPagePath(pathname: string): string {
  const path = String(pathname ?? "").split("?")[0]?.split("#")[0] ?? "/";
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path || "/";
}

export function sanitizeAnalyticsParams(
  params: Record<string, unknown> | undefined
): Record<string, string | number | boolean> {
  const safe: Record<string, string | number | boolean> = {};
  if (!params) return safe;
  for (const [key, value] of Object.entries(params)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "number") {
      if (Number.isFinite(value)) safe[key] = value;
      continue;
    }
    if (typeof value === "boolean") {
      safe[key] = value;
      continue;
    }
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 80 || trimmed.includes("@") || /bearer\s/i.test(trimmed)) continue;
    safe[key] = trimmed;
  }
  return safe;
}

export function createPageTracker(send: (path: string) => void) {
  let last = "";
  return (pathname: string) => {
    const path = analyticsPagePath(pathname);
    if (path === last) return false;
    last = path;
    send(path);
    return true;
  };
}

export function listingId(value: string | undefined | null): string | null {
  const id = String(value ?? "").trim();
  return /^[a-f0-9]{24}$/i.test(id) ? id : null;
}

export function vehicleType(value: string | undefined | null): "CAR" | "BIKE" | null {
  return value === "CAR" || value === "BIKE" ? value : null;
}

export function inrValue(paise: number): number | null {
  if (!Number.isFinite(paise) || paise < 0) return null;
  return Math.round(paise) / 100;
}
