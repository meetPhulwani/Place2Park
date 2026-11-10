import {
  analyticsAllowed,
  analyticsPagePath,
  browserPrivacyOptOut,
  createPageTracker,
  inrValue,
  listingId,
  measurementId,
  sanitizeAnalyticsParams,
  vehicleType,
} from "./analytics";

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
  interface Navigator {
    globalPrivacyControl?: boolean;
  }
}

const AUTH_METHOD_KEY = "p2p_ga_auth_method";
let started = false;
let lastListing = "";
let lastPage = "";
const trackPage = createPageTracker((path) => {
  send("page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
  });
});

function send(name: string, params?: Record<string, unknown>) {
  if (!started || typeof window.gtag !== "function") return;
  const safe = sanitizeAnalyticsParams(params);
  if (name === "page_view") {
    window.gtag("event", name, {
      page_path: analyticsPagePath(String(params?.page_path ?? "/")),
      page_location: String(params?.page_location ?? window.location.origin),
    });
    return;
  }
  window.gtag("event", name, safe);
}

/** Official Google tag. No-ops unless this is the public production site and the ID is set. */
export function initGoogleAnalytics() {
  if (started || typeof document === "undefined") return;
  const id = measurementId(import.meta.env.VITE_GA_MEASUREMENT_ID);
  const allowed = analyticsAllowed({
    production: import.meta.env.PROD,
    measurementId: id,
    console: Boolean(document.querySelector('meta[name="console-base"]')),
    privacyOptOut: browserPrivacyOptOut(window.navigator),
  });
  if (!allowed || !id) return;
  started = true;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  document.head.appendChild(script);
}

export function trackPageView(pathname: string) {
  if (!started) return;
  const path = analyticsPagePath(pathname);
  if (path !== lastPage) {
    lastPage = path;
    lastListing = "";
  }
  trackPage(pathname);
}

export function rememberAuthMethod(method: "password" | "google") {
  try {
    sessionStorage.setItem(AUTH_METHOD_KEY, method);
  } catch {
    /* storage unavailable */
  }
}

export function takeAuthMethod(): "password" | "google" {
  try {
    const value = sessionStorage.getItem(AUTH_METHOD_KEY);
    sessionStorage.removeItem(AUTH_METHOD_KEY);
    return value === "google" ? "google" : "password";
  } catch {
    return "password";
  }
}

export function trackLogin(method: "password" | "google") {
  send("login", { method });
}

export function trackSignUp(method: "password" | "google") {
  send("sign_up", { method });
}

export function trackParkingSearch(resultCount: number) {
  if (!Number.isInteger(resultCount) || resultCount < 0) return;
  send("parking_search", { result_count: resultCount });
}

export function trackListingView(id: string | undefined) {
  const listing = listingId(id);
  if (!listing || listing === lastListing) return;
  lastListing = listing;
  send("listing_view", { listing_id: listing });
}

export function trackBookingStart(input: { durationMins: number; vehicle: string; totalPaise: number }) {
  const kind = vehicleType(input.vehicle);
  const value = inrValue(input.totalPaise);
  if (!kind || value == null || !Number.isInteger(input.durationMins)) return;
  send("booking_start", { duration_mins: input.durationMins, vehicle_type: kind, value, currency: "INR" });
}

export function trackBookingConfirmed(totalPaise: number) {
  const value = inrValue(totalPaise);
  if (value == null) return;
  send("booking_confirmed", { value, currency: "INR" });
}
