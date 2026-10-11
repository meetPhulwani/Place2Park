import * as React from "react";
import Link from "@/components/link";
import { CalendarClock } from "lucide-react";
import { api } from "@/services/api";
import type { Booking } from "@/types";
import { BookingCard } from "@/components/booking-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const TABS = [
  { key: "upcoming", label: "Upcoming" },
  { key: "past", label: "Past" },
  { key: "cancelled", label: "Cancelled" },
] as const;

export default function BookingsPage() {
  const [tab, setTab] = React.useState<(typeof TABS)[number]["key"]>("upcoming");
  const [bookings, setBookings] = React.useState<Booking[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = "Your bookings · Parkly";
    setBookings(null);
    setError(null);
    api
      .get(`/bookings?scope=${tab}`)
      .then(({ data }) => setBookings(data.data.bookings))
      .catch(() => {
        setBookings([]);
        setError("Couldn't load your bookings. Check your connection and try again.");
      });
  }, [tab]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-1 text-sm text-slate-500">Upcoming, past and cancelled reservations.</p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Booking sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              tab === t.key ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {bookings === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : bookings.length === 0 && !error ? (
        <EmptyState
          icon={CalendarClock}
          title={tab === "upcoming" ? "Nothing booked yet" : "Nothing here"}
          description={
            tab === "upcoming"
              ? "When you reserve parking, it will show up here with directions and your access code."
              : tab === "past"
                ? "Completed stays appear here after the booking ends."
                : "Cancelled and expired bookings appear here."
          }
          action={
            tab === "upcoming" ? (
              <Link href="/search">
                <Button>Find parking</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      )}
    </div>
  );
}
