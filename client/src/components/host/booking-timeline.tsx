/**
 * Sticky-header booking timeline modelled on Skiper UI 74
 * (https://skiper-ui.com/v1/skiper74). That registry component is Pro-gated,
 * so this is a Place2Park-native implementation using existing host calendar data.
 * Attribution: Skiper UI / recreation of a version by merycodes.
 */
import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "@/components/link";
import { BookingStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";
import type { TimelineDay } from "@/lib/booking-timeline";

function startOfWeek(d: Date) {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - next.getDay());
  return next;
}

function inCurrentWeek(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  if (!y || !m || !d) return false;
  const date = new Date(y, m - 1, d);
  const from = startOfWeek(new Date());
  const to = new Date(from);
  to.setDate(to.getDate() + 7);
  return date >= from && date < to;
}

export function BookingTimeline({
  days,
  monthLabel,
  listingControl,
  onPrevMonth,
  onNextMonth,
  loading,
}: {
  days: TimelineDay[];
  monthLabel: string;
  listingControl?: React.ReactNode;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  loading?: boolean;
}) {
  const [range, setRange] = React.useState<"month" | "week">("month");
  const weekHasDays = days.some((day) => inCurrentWeek(day.key));
  const visible = range === "week" && weekHasDays ? days.filter((day) => inCurrentWeek(day.key)) : days;
  const visibleKey = visible.map((day) => day.key).join("|");
  const [activeKey, setActiveKey] = React.useState(visible[0]?.key ?? "");
  const scrollerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (range === "week" && !weekHasDays) setRange("month");
  }, [range, weekHasDays]);

  React.useEffect(() => {
    setActiveKey(visible[0]?.key ?? "");
  }, [visibleKey]);

  React.useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;
    const update = () => {
      const sections = [...root.querySelectorAll<HTMLElement>("[data-day]")];
      if (sections.length === 0) return;
      const origin = root.getBoundingClientRect().top + 80;
      let key = sections[0]?.dataset.day ?? "";
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= origin) key = section.dataset.day ?? key;
        else break;
      }
      if (key) setActiveKey(key);
    };
    update();
    root.addEventListener("scroll", update, { passive: true });
    return () => root.removeEventListener("scroll", update);
  }, [visibleKey]);

  const active = visible.find((day) => day.key === activeKey) ?? visible[0];

  const header = (
    <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0 flex-1">{listingControl}</div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-line bg-page p-0.5" role="group" aria-label="Timeline range">
          <button
            type="button"
            onClick={() => weekHasDays && setRange("week")}
            disabled={!weekHasDays || loading}
            className={cn(
              "min-h-10 rounded-md px-3 text-sm font-medium",
              range === "week" ? "bg-brand-500 text-white" : "text-muted hover:text-ink",
              (!weekHasDays || loading) && "cursor-not-allowed opacity-40 hover:text-muted"
            )}
          >
            This week
          </button>
          <button
            type="button"
            onClick={() => setRange("month")}
            disabled={loading}
            className={cn(
              "min-h-10 rounded-md px-3 text-sm font-medium",
              range === "month" || !weekHasDays ? "bg-brand-500 text-white" : "text-muted hover:text-ink"
            )}
          >
            Month
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPrevMonth}
            aria-label="Previous month"
            disabled={loading}
            className="flex size-10 items-center justify-center rounded-lg border border-line text-muted hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <span className="min-w-36 text-center text-sm font-semibold text-ink">{monthLabel}</span>
          <button
            type="button"
            onClick={onNextMonth}
            aria-label="Next month"
            disabled={loading}
            className="flex size-10 items-center justify-center rounded-lg border border-line text-muted hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="overflow-hidden rounded-xl border border-line bg-white shadow-card"
      aria-busy={loading || undefined}
    >
      {header}
      {loading ? (
        <div className="p-5">
          <Skeleton className="h-64 rounded-lg" />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={range === "week" ? "Nothing this week" : "No bookings this month"}
          description="Confirmed and active reservations appear here. Cancelled stays are left off the timeline."
          className="border-0 bg-transparent"
        />
      ) : (
        <div ref={scrollerRef} className="max-h-[28rem] overflow-y-auto overflow-x-hidden">
          <div className="sticky top-0 z-10 border-b border-line bg-white px-5 py-3 shadow-[0_1px_0_0_rgba(17,24,39,0.04)]">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">Schedule</p>
            <div className="relative min-h-8 overflow-hidden sm:min-h-9">
              <AnimatePresence mode="wait">
                <motion.p
                  key={active?.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.18 }}
                  className="font-display text-xl font-semibold tracking-tight text-brand-600 sm:text-2xl"
                >
                  {active?.label}
                </motion.p>
              </AnimatePresence>
            </div>
          </div>
          {visible.map((day) => (
            <section
              key={day.key}
              data-day={day.key}
              aria-label={day.label}
              className="border-b border-line px-5 py-4 last:border-b-0"
            >
              <h3 className="text-sm font-semibold text-ink">{day.label}</h3>
              <ul className="mt-3 space-y-2">
                {day.items.map((item, index) => {
                  const prev = day.items[index - 1];
                  const overlaps =
                    item.kind === "booking" &&
                    prev?.kind === "booking" &&
                    new Date(item.start).getTime() < new Date(prev.end).getTime();
                  return (
                    <li key={item.id}>
                      {item.href && item.kind === "booking" ? (
                        <Link
                          href={item.href}
                          className={cn(
                            "flex min-w-0 flex-col gap-2 rounded-lg border border-line bg-page px-3 py-2.5 transition-colors hover:border-brand-400 hover:bg-brand-50 sm:flex-row sm:items-center sm:justify-between",
                            overlaps && "border-brand-400 border-l-[3px] border-l-brand-500"
                          )}
                        >
                          <ItemBody item={item} />
                        </Link>
                      ) : (
                        <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-dashed border-mist bg-mist-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                          <ItemBody item={item} />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemBody({
  item,
}: {
  item: TimelineDay["items"][number];
}) {
  return (
    <>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{item.title}</p>
        {item.subtitle && <p className="truncate text-xs text-muted">{item.subtitle}</p>}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
        <p className="text-xs font-medium text-muted">
          {formatTime(item.start)} – {formatTime(item.end)}
        </p>
        {item.kind === "booking" && item.status ? (
          <BookingStatusBadge status={item.status} />
        ) : (
          <span className="rounded-md bg-mist px-2 py-0.5 text-xs font-medium text-ink">Unavailable</span>
        )}
      </div>
    </>
  );
}
