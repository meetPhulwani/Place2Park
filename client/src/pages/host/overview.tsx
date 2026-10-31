import * as React from "react";
import Link from "@/components/link";
import { Building2, CalendarClock, CalendarDays, Plus, Wallet } from "lucide-react";
import { api } from "@/services/api";
import type { Booking, BookingSpaceRef } from "@/types";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge, SpaceStatusBadge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { DashboardSection } from "@/components/dashboard/section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { DashboardLoadError } from "@/components/dashboard/load-error";
import { formatINR, formatDate, formatTime } from "@/lib/utils";
import { Select } from "@/components/ui/input";
import { BookingTimeline } from "@/components/host/booking-timeline";
import { buildTimelineDays, type TimelineDay } from "@/lib/booking-timeline";

interface OverviewListing {
  id: string;
  title: string;
  area?: string;
  status: string;
  pricePerHour?: number;
}

interface OverviewData {
  todays: Booking[];
  upcoming: Booking[];
  monthEarning: number;
  monthBookings: number;
  occupancyPct: number;
  activeListings: number;
  pendingListings?: number;
  listings?: OverviewListing[];
}

interface CalendarPayload {
  bookings: Booking[];
  blocked: { id: string; start: string; end: string; reason?: string }[];
  spaces: { id: string; title: string }[];
  spaceId: string | null;
}

function rowsOf(bookings: Booking[], when: (b: Booking) => string) {
  return bookings.map((b) => {
    const space = b.spaceId as BookingSpaceRef;
    const user = b.userId as { name?: string | null } | string;
    return {
      id: b.id,
      code: b.code,
      customer: (typeof user === "object" && user?.name) || "Driver",
      space: space?.title ?? "",
      when: when(b),
      amount: b.hostEarning,
      status: b.status,
    };
  });
}

export default function HostDashboardPage() {
  const [data, setData] = React.useState<OverviewData | null>(null);
  const [failed, setFailed] = React.useState(false);
  const now = new Date();
  const [calMonth, setCalMonth] = React.useState({ year: now.getFullYear(), month: now.getMonth() });
  const [calSpace, setCalSpace] = React.useState("");
  const [calendar, setCalendar] = React.useState<CalendarPayload | null>(null);
  const [calLoading, setCalLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setFailed(false);
    setData(null);
    api
      .get("/host/overview")
      .then(({ data: d }) => setData(d.data))
      .catch(() => setFailed(true));
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    setCalLoading(true);
    const qs = new URLSearchParams({ year: String(calMonth.year), month: String(calMonth.month) });
    if (calSpace) qs.set("spaceId", calSpace);
    api
      .get(`/host/calendar?${qs}`)
      .then(({ data: d }) => {
        if (cancelled) return;
        setCalendar(d.data);
      })
      .catch(() => {
        if (!cancelled) setCalendar({ bookings: [], blocked: [], spaces: [], spaceId: null });
      })
      .finally(() => {
        if (!cancelled) setCalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [calMonth.year, calMonth.month, calSpace]);

  React.useEffect(() => {
    document.title = "Host dashboard · Place2Park";
    load();
  }, [load]);

  if (!data && failed) {
    return <DashboardLoadError onRetry={load} />;
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  const listings = data.listings ?? [];
  const spaceTitle = calendar?.spaces.find((s) => s.id === (calendar.spaceId ?? calSpace))?.title;
  const timelineDays: TimelineDay[] = calendar
    ? buildTimelineDays({
        bookings: calendar.bookings,
        blocked: calendar.blocked,
        spaceTitle,
      })
    : [];
  const monthLabel = new Date(calMonth.year, calMonth.month, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="space-y-8">
      <DashboardHeader
        title="Host dashboard"
        description="Bookings, occupancy, and earnings across your spaces."
        actions={
          <Link href="/host/listings/new">
            <Button variant="accent">
              <Plus className="size-4" aria-hidden />
              Add parking
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="CalendarClock" label="Today's bookings" value={data.todays.length} format="integer" />
        <StatCard
          icon="Wallet"
          highlight
          label="This month"
          value={data.monthEarning}
          format="currency-paise"
          hint={`${data.monthBookings} bookings`}
        />
        <StatCard
          icon="Percent"
          label="Occupancy (month)"
          value={data.occupancyPct}
          format="percent"
          hint="Booked vs. available hours"
        />
        <StatCard
          icon="Building2"
          label="Active listings"
          value={data.activeListings}
          format="integer"
          hint={data.pendingListings ? `${data.pendingListings} pending review` : undefined}
        />
      </div>

      <QuickActions
        items={[
          { href: "/host/listings", label: "My listings", icon: Building2 },
          { href: "/host/calendar", label: "Calendar", icon: CalendarDays },
          { href: "/host/bookings", label: "Bookings", icon: CalendarClock },
          { href: "/host/earnings", label: "Earnings", icon: Wallet },
        ]}
      />

      <DashboardSection id="timeline-h" title="Booking timeline" href="/host/calendar" hrefLabel="Full calendar">
        <BookingTimeline
          days={timelineDays}
          monthLabel={monthLabel}
          loading={calLoading}
          onPrevMonth={() =>
            setCalMonth((cur) => {
              const d = new Date(cur.year, cur.month - 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })
          }
          onNextMonth={() =>
            setCalMonth((cur) => {
              const d = new Date(cur.year, cur.month + 1, 1);
              return { year: d.getFullYear(), month: d.getMonth() };
            })
          }
          listingControl={
            calendar && calendar.spaces.length > 0 ? (
              <Select
                id="overview-cal-space"
                className="h-10 w-full sm:max-w-xs"
                value={calSpace || calendar.spaceId || calendar.spaces[0].id}
                onChange={(e) => setCalSpace(e.target.value)}
                aria-label="Listing for timeline"
                disabled={calLoading}
              >
                {calendar.spaces.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            ) : calLoading ? (
              <Skeleton className="h-10 w-full sm:max-w-xs" />
            ) : (
              <p className="text-sm text-muted">Publish a listing to see its booking timeline.</p>
            )
          }
        />
      </DashboardSection>

      <DashboardSection id="today-h" title="Today">
        {data.todays.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No bookings today"
            description="New bookings will appear here the moment a driver pays."
          />
        ) : (
          <BookingTable rows={rowsOf(data.todays, (b) => `${formatTime(b.start)} – ${formatTime(b.end)}`)} />
        )}
      </DashboardSection>

      <DashboardSection id="up-h" title="Upcoming" href="/host/bookings" hrefLabel="All bookings">
        {data.upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line bg-white p-6 text-center text-sm text-muted">
            No upcoming bookings beyond today yet.
          </p>
        ) : (
          <BookingTable rows={rowsOf(data.upcoming, (b) => `${formatDate(b.start)}, ${formatTime(b.start)}`)} />
        )}
      </DashboardSection>

      {listings.length > 0 && (
        <DashboardSection id="listings-h" title="Your listings" href="/host/listings">
          <div className="grid gap-3 sm:grid-cols-2">
            {listings.slice(0, 4).map((listing) => (
              <Link key={listing.id} href={`/host/listings/${listing.id}/edit`} className="min-w-0">
                <Card className="flex h-full min-w-0 items-center justify-between gap-3 p-4 transition-[border-color,box-shadow] duration-200 hover:border-brand-400 hover:shadow-card-hover">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{listing.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {listing.area || "—"}
                      {listing.pricePerHour != null ? ` · ${formatINR(listing.pricePerHour)}/hr` : ""}
                    </p>
                  </div>
                  <SpaceStatusBadge status={listing.status} />
                </Card>
              </Link>
            ))}
          </div>
        </DashboardSection>
      )}
    </div>
  );
}

function BookingTable({
  rows,
}: {
  rows: { id: string; code: string; customer: string; space: string; when: string; amount: number; status: string }[];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-card">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wider text-muted">
            <th className="px-5 py-3 font-medium">Booking</th>
            <th className="px-5 py-3 font-medium">Customer</th>
            <th className="px-5 py-3 font-medium">Space</th>
            <th className="px-5 py-3 font-medium">When</th>
            <th className="px-5 py-3 font-medium">Your earning</th>
            <th className="px-5 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line last:border-0 hover:bg-page">
              <td className="px-5 py-3 font-medium text-ink">{r.code}</td>
              <td className="px-5 py-3 text-muted">{r.customer}</td>
              <td className="max-w-[200px] truncate px-5 py-3 text-muted">{r.space}</td>
              <td className="px-5 py-3 text-muted">{r.when}</td>
              <td className="px-5 py-3 font-semibold text-brand-600">{formatINR(r.amount)}</td>
              <td className="px-5 py-3">
                <BookingStatusBadge status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
