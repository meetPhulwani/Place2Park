import * as React from "react";
import Link from "@/components/link";
import { CalendarClock, Heart, History, Search, Star } from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/context/auth";
import type { Booking, SpaceSummary } from "@/types";
import { BookingCard } from "@/components/booking-card";
import { ParkingCard } from "@/components/parking-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatINR } from "@/lib/utils";

interface DashboardData {
  upcoming: Booking[];
  recent: Booking[];
  saved: SpaceSummary[];
  stats: { completed: number; totalSpent: number };
  pendingReviews: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);

  React.useEffect(() => {
    document.title = "Dashboard · Parkly";
    api.get("/users/me/dashboard").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-40 rounded-2xl" />
      </div>
    );
  }

  const { upcoming, recent, saved, stats, pendingReviews } = data;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Hi{user?.name ? `, ${user.name.split(" ")[0]}` : ""} 👋
          </h1>
          <p className="mt-1 text-sm text-slate-500">Here&apos;s what&apos;s happening with your parking.</p>
        </div>
        <Link href="/search">
          <Button>
            <Search className="size-4" aria-hidden />
            Find parking
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="CalendarClock" label="Upcoming bookings" value={upcoming.length} />
        <StatCard
          icon="History"
          label="Completed"
          value={stats.completed}
          hint={`${formatINR(stats.totalSpent)} spent in total`}
        />
        <StatCard
          icon="Star"
          label="Pending reviews"
          value={pendingReviews}
          hint={pendingReviews > 0 ? "Share your experience" : "All caught up"}
        />
      </div>

      <section aria-labelledby="upcoming-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="upcoming-h" className="text-lg font-semibold text-slate-900">Upcoming</h2>
          <Link href="/bookings" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            View all
          </Link>
        </div>
        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No upcoming bookings"
            description="Reserve a spot before your next trip and skip the circling."
            action={
              <Link href="/search">
                <Button variant="secondary">Search parking</Button>
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

      {recent.length > 0 && (
        <section aria-labelledby="recent-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-h" className="text-lg font-semibold text-slate-900">Recent activity</h2>
            <Link href="/history" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              Full history
            </Link>
          </div>
          <div className="space-y-3">
            {recent.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        </section>
      )}

      {saved.length > 0 && (
        <section aria-labelledby="saved-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="saved-h" className="text-lg font-semibold text-slate-900">Saved spaces</h2>
            <Link href="/saved" className="text-sm font-medium text-brand-700 hover:text-brand-800">
              View all
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {saved.map((s) => (
              <ParkingCard key={s.id} space={s} />
            ))}
          </div>
        </section>
      )}

      {pendingReviews === 0 && upcoming.length === 0 && recent.length === 0 && saved.length === 0 && (
        <EmptyState
          icon={Heart}
          title="Welcome to Parkly"
          description="Search for parking near your destination to get started."
          action={
            <Link href="/search">
              <Button>Find your first spot</Button>
            </Link>
          }
        />
      )}
    </div>
  );
}
