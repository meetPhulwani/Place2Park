import * as React from "react";
import Link from "@/components/link";
import { CalendarClock, Plus } from "lucide-react";
import { api } from "@/services/api";
import type { Booking, BookingSpaceRef } from "@/types";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/components/ui/badge";
import { formatINR, formatDate, formatTime } from "@/lib/utils";

interface OverviewData {
  todays: Booking[];
  upcoming: Booking[];
  monthEarning: number;
  monthBookings: number;
  occupancyPct: number;
  activeListings: number;
  pendingListings?: number;
  listings?: { id: string; title: string; status: string }[];
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

  React.useEffect(() => {
    document.title = "Host dashboard · Parkly";
    api.get("/host/overview").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Host dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-500">Bookings and earnings across your spaces.</p>
        </div>
        <Link href="/host/listings/new">
          <Button>
            <Plus className="size-4" aria-hidden />
            Add parking
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="CalendarClock" label="Today's bookings" value={data.todays.length} />
        <StatCard
          icon="Wallet"
          label="This month"
          value={formatINR(data.monthEarning)}
          hint={`${data.monthBookings} bookings`}
        />
        <StatCard icon="Percent" label="Occupancy (month)" value={`${data.occupancyPct}%`} hint="Booked vs. available hours" />
        <StatCard icon="Building2" label="Active listings" value={data.activeListings} hint={data.pendingListings ? `${data.pendingListings} pending review` : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/host/listings"><Button size="sm" variant="secondary">My listings</Button></Link>
        <Link href="/host/calendar"><Button size="sm" variant="secondary">Calendar</Button></Link>
        <Link href="/host/bookings"><Button size="sm" variant="secondary">Bookings</Button></Link>
        <Link href="/host/earnings"><Button size="sm" variant="secondary">Earnings</Button></Link>
      </div>

      <section aria-labelledby="today-h">
        <h2 id="today-h" className="mb-3 text-lg font-semibold text-slate-900">Today</h2>
        {data.todays.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No bookings today"
            description="New bookings will appear here the moment a driver pays."
          />
        ) : (
          <BookingTable rows={rowsOf(data.todays, (b) => `${formatTime(b.start)} – ${formatTime(b.end)}`)} />
        )}
      </section>

      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up-h" className="text-lg font-semibold text-slate-900">Upcoming</h2>
          <Link href="/host/bookings" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            All bookings
          </Link>
        </div>
        {data.upcoming.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
            No upcoming bookings beyond today yet.
          </p>
        ) : (
          <BookingTable rows={rowsOf(data.upcoming, (b) => `${formatDate(b.start)}, ${formatTime(b.start)}`)} />
        )}
      </section>
    </div>
  );
}

function BookingTable({
  rows,
}: {
  rows: { id: string; code: string; customer: string; space: string; when: string; amount: number; status: string }[];
}) {
  return (
    <div className="glass overflow-x-auto rounded-2xl">
      <table className="w-full min-w-[620px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
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
            <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
              <td className="px-5 py-3 font-medium text-slate-900">{r.code}</td>
              <td className="px-5 py-3 text-slate-600">{r.customer}</td>
              <td className="max-w-[200px] truncate px-5 py-3 text-slate-600">{r.space}</td>
              <td className="px-5 py-3 text-slate-600">{r.when}</td>
              <td className="px-5 py-3 font-semibold text-slate-900">{formatINR(r.amount)}</td>
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
