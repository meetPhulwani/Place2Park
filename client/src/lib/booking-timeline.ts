import { BLOCKING_STATUSES } from "./constants.js";

const HIDDEN_STATUSES = new Set(["CANCELLED", "EXPIRED"]);
const TIMELINE_STATUSES = new Set([...BLOCKING_STATUSES, "COMPLETED"]);

export type TimelineItemKind = "booking" | "block";

export type TimelineItem = {
  id: string;
  kind: TimelineItemKind;
  title: string;
  subtitle?: string;
  start: string;
  end: string;
  status?: string;
  href?: string;
};

export type TimelineDay = {
  key: string;
  label: string;
  items: TimelineItem[];
};

type TimelineBooking = {
  id: string;
  code?: string;
  start: string;
  end: string;
  status: string;
  userId?: { name?: string | null } | string;
  spaceId?: { title?: string | null } | string;
};

type TimelineBlock = {
  id: string;
  start: string;
  end: string;
  reason?: string;
};

function localDayKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatTimelineDate(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(y, m - 1, d);
  const monthDay = date.toLocaleDateString("en-IN", { day: "numeric", month: "long" });
  const weekday = date.toLocaleDateString("en-IN", { weekday: "long" });
  return `${monthDay} / ${weekday}`;
}

function guestName(userId: TimelineBooking["userId"]) {
  if (userId && typeof userId === "object" && userId.name) return userId.name;
  return "Driver";
}

function spaceName(spaceId: TimelineBooking["spaceId"], fallback?: string) {
  if (spaceId && typeof spaceId === "object" && spaceId.title) return spaceId.title;
  return fallback;
}

export function buildTimelineDays(input: {
  bookings: TimelineBooking[];
  blocked?: TimelineBlock[];
  spaceTitle?: string;
}): TimelineDay[] {
  const buckets = new Map<string, TimelineItem[]>();

  function push(iso: string, item: TimelineItem) {
    const key = localDayKey(iso);
    if (!key) return;
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  for (const booking of input.bookings) {
    if (HIDDEN_STATUSES.has(booking.status) || !TIMELINE_STATUSES.has(booking.status)) continue;
    const listing = spaceName(booking.spaceId, input.spaceTitle);
    push(booking.start, {
      id: booking.id,
      kind: "booking",
      title: guestName(booking.userId),
      subtitle: [listing, booking.code].filter(Boolean).join(" · "),
      start: booking.start,
      end: booking.end,
      status: booking.status,
      href: `/host/bookings`,
    });
  }

  for (const block of input.blocked ?? []) {
    push(block.start, {
      id: block.id,
      kind: "block",
      title: "Blocked",
      subtitle: block.reason?.trim() || "Space unavailable",
      start: block.start,
      end: block.end,
    });
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      label: formatTimelineDate(key),
      items: items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    }));
}
