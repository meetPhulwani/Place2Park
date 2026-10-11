import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarClock } from "lucide-react";
import { api } from "@/services/api";
import type { Booking, BookingSpaceRef } from "@/types";
import { BookingStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDuration, formatINR, formatTime } from "@/lib/utils";

export default function HostBookingsPage() {
  const [params, setParams] = useSearchParams();
  const [bookings, setBookings] = React.useState<Booking[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const statusFilter = ["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED"].includes(params.get("status") ?? "")
    ? params.get("status")!
    : undefined;

  React.useEffect(() => {
    document.title = "Host bookings · Parkly";
    setBookings(null);
    setError(null);
    api
      .get(`/host/bookings${statusFilter ? `?status=${statusFilter}` : ""}`)
      .then(({ data }) => setBookings(data.data.bookings))
      .catch(() => {
        setBookings([]);
        setError("Couldn't load bookings for your listings.");
      });
  }, [statusFilter]);

  const tabs = [
    { key: undefined, label: "All" },
    { key: "CONFIRMED", label: "Upcoming" },
    { key: "ACTIVE", label: "In progress" },
    { key: "COMPLETED", label: "Completed" },
    { key: "CANCELLED", label: "Cancelled" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-1 text-sm text-slate-500">Every reservation across your listings.</p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter bookings">
        {tabs.map((t) => {
          const active = statusFilter === t.key;
          return (
            <button
              key={t.label}
              onClick={() => setParams(t.key ? { status: t.key } : {}, { replace: true })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {bookings === null ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : bookings.length === 0 && !error ? (
        <EmptyState
          icon={CalendarClock}
          title="No bookings here"
          description="Bookings for your listings appear here. Other hosts' reservations are never shown."
        />
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 font-medium">Booking ID</th>
                <th className="px-5 py-3.5 font-medium">Customer</th>
                <th className="px-5 py-3.5 font-medium">Parking</th>
                <th className="px-5 py-3.5 font-medium">Date & time</th>
                <th className="px-5 py-3.5 font-medium">Duration</th>
                <th className="px-5 py-3.5 font-medium">Your earning</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const space = b.spaceId as BookingSpaceRef;
                const user = b.userId as { name?: string | null } | string;
                return (
                  <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{b.code}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {(typeof user === "object" && user?.name) || "Driver"}
                    </td>
                    <td className="max-w-[220px] truncate px-5 py-3.5 text-slate-600">{space?.title}</td>
                    <td className="px-5 py-3.5 text-slate-600">
                      {formatDate(b.start)}, {formatTime(b.start)}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600">{formatDuration(b.durationMins)}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-900">
                      {b.status === "CANCELLED" ? "—" : formatINR(b.hostEarning)}
                    </td>
                    <td className="px-5 py-3.5">
                      <BookingStatusBadge status={b.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
