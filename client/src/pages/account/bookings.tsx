import * as React from "react";
import Link from "@/components/link";
import { CalendarClock } from "lucide-react";
import { api } from "@/services/api";
import type { Booking } from "@/types";
import { BookingCard } from "@/components/booking-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";
import BookingHistory from "@/pages/account/history";

interface BookingStats {
  upcoming: number;
  completed: number;
  totalSpent: number;
  pendingReviews: number;
}

export default function BookingsPage() {
  const [upcoming, setUpcoming] = React.useState<Booking[] | null>(null);
  const [stats, setStats] = React.useState<BookingStats | null>(null);
  const [statsSettled, setStatsSettled] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    document.title = "My bookings · Place2Park";
    setUpcoming(null);
    setError(null);
    api
      .get("/bookings?scope=upcoming")
      .then(({ data }) => setUpcoming(data.data.bookings))
      .catch(() => {
        setUpcoming([]);
        setError("Couldn't load your bookings. Check your connection and try again.");
      });
    api
      .get("/users/me/dashboard")
      .then(({ data }) => {
        const body = data.data as {
          upcoming: unknown[];
          stats: { completed: number; totalSpent: number };
          pendingReviews: number;
        };
        setStats({
          upcoming: body.upcoming.length,
          completed: body.stats.completed,
          totalSpent: body.stats.totalSpent,
          pendingReviews: body.pendingReviews,
        });
      })
      .catch(() => setStats(null))
      .finally(() => setStatsSettled(true));
  }, []);

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">My bookings</h1>
        <p className="mt-1 text-sm text-slate-500">Upcoming reservations and parking history.</p>
      </div>

      {!statsSettled ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" />
        </div>
      ) : stats ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon="CalendarClock" label="Upcoming bookings" value={upcoming?.length ?? stats.upcoming} format="integer" />
          <StatCard
            icon="History"
            label="Completed"
            value={stats.completed}
            format="integer"
            hint={`${formatINR(stats.totalSpent)} spent in total`}
          />
          <StatCard
            icon="IndianRupee"
            label="Total spent"
            value={stats.totalSpent}
            format="currency-paise"
            hint="Completed bookings only"
          />
          <StatCard
            icon="Star"
            label="Pending reviews"
            value={stats.pendingReviews}
            format="integer"
            hint={stats.pendingReviews > 0 ? "Share your experience" : "All caught up"}
          />
        </div>
      ) : null}

      <section className="space-y-4" aria-labelledby="upcoming-bookings">
        <h2 id="upcoming-bookings" className="font-display text-xl font-bold tracking-tight text-slate-900">
          Upcoming
        </h2>
        {error && (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
        )}
        {upcoming === null ? (
          <div className="space-y-3">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
        ) : upcoming.length === 0 && !error ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing booked yet"
            description="When you reserve parking, it will show up here with directions and your access code."
            action={
              <Link href="/search">
                <Button variant="accent">Find parking</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {upcoming.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        )}
      </section>

      <BookingHistory />
    </div>
  );
}
