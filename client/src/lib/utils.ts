import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format paise as INR, e.g. 4500 -> "₹45". */
export function formatINR(paise: number, opts?: { decimals?: boolean }) {
  const rupees = paise / 100;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: opts?.decimals ? 2 : 0,
    minimumFractionDigits: 0,
  }).format(rupees);
}

export function formatDate(d: Date | string) {
  return new Date(d).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(d: Date | string) {
  return new Date(d).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDateTime(d: Date | string) {
  return `${formatDate(d)}, ${formatTime(d)}`;
}

export function formatDuration(mins: number) {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h >= 24 && h % 24 === 0 && m === 0) return h === 24 ? "24 hours" : `${h / 24} days`;
  return m === 0 ? `${h} hour${h > 1 ? "s" : ""}` : `${h}h ${m}m`;
}

/** Walking distance estimate: ~80m per minute. */
export function walkingMins(distanceKm: number) {
  return Math.max(1, Math.round((distanceKm * 1000) / 80));
}

export function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

export function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Round a Date up to the next 30-minute step. */
export function nextHalfHour(from = new Date()) {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const m = d.getMinutes();
  d.setMinutes(m === 0 ? 0 : m <= 30 ? 30 : 60);
  return d;
}

export function toDateInputValue(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 10);
}

export function toTimeInputValue(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
