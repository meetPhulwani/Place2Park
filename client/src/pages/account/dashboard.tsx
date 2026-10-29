import * as React from "react";
import Link from "@/components/link";
import { CalendarClock, CreditCard, Heart, Search } from "lucide-react";
import { api } from "@/services/api";
import { useAuth } from "@/context/auth";
import type { Booking, SpaceSummary } from "@/types";
import { BookingCard } from "@/components/booking-card";
import { ParkingCard } from "@/components/parking-card";
import { StatCard } from "@/components/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { DashboardSection } from "@/components/dashboard/section";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { DashboardLoadError } from "@/components/dashboard/load-error";
import { NearbyParking } from "@/components/dashboard/nearby-parking";
import { SpendingOverview } from "@/components/dashboard/spending-overview";
import { spaceCoordinates } from "@/lib/space-coords";
import { formatINR } from "@/lib/utils";

interface DashboardData {
  upcoming: Booking[];
  recent: Booking[];
  saved: SpaceSummary[];
  stats: { completed: number; totalSpent: number };
  pendingReviews: number;
}

function hintFromDashboard(data: DashboardData) {
  for (const booking of data.upcoming) {
    const space = typeof booking.spaceId === "object" ? booking.spaceId : null;
    const coords = spaceCoordinates(space);
    if (coords) return coords;
  }
  for (const space of data.saved) {
    const coords = spaceCoordinates(space);
    if (coords) return coords;
  }
  return null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<DashboardData | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    setFailed(false);
    setData(null);
    api
      .get("/users/me/dashboard")
      .then(({ data: d }) => setData(d.data))
      .catch(() => setFailed(true));
  }, []);

  React.useEffect(() => {
    document.title = "Dashboard · Parkly";
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
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const { upcoming, recent, saved, stats, pendingReviews } = data;
  const firstName = user?.name?.split(" ")[0];
  return (
    <div className="space-y-8">
      <DashboardHeader
        title={firstName ? `Hi, ${firstName}` : "Dashboard"}
        description="Your bookings, nearby parking, and spending in one place."
        actions={
          <Link href="/search">
            <Button>
              <Search className="size-4" aria-hidden />
              Find parking
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="CalendarClock" label="Upcoming bookings" value={upcoming.length} />
        <StatCard
          icon="History"
          label="Completed"
          value={stats.completed}
          hint={`${formatINR(stats.totalSpent)} spent in total`}
        />
        <StatCard icon="IndianRupee" label="Total spent" value={formatINR(stats.totalSpent)} hint="Completed bookings only" />
        <StatCard
          icon="Star"
          label="Pending reviews"
          value={pendingReviews}
          hint={pendingReviews > 0 ? "Share your experience" : "All caught up"}
        />
      </div>

      <QuickActions
        items={[
          { href: "/search", label: "Find parking", icon: Search },
          { href: "/bookings", label: "Upcoming", icon: CalendarClock },
          { href: "/saved", label: "Saved spaces", icon: Heart },
          { href: "/payments", label: "Payments", icon: CreditCard },
        ]}
      />

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <DashboardSection id="upcoming-h" title="Upcoming bookings" href="/bookings">
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
        </DashboardSection>
        <SpendingOverview completed={stats.completed} totalSpent={stats.totalSpent} recent={recent} />
      </div>

      <DashboardSection id="discover-h" title="Parking nearby" href="/search" hrefLabel="Open map">
        <NearbyParking hint={hintFromDashboard(data)} />
      </DashboardSection>

      {recent.length > 0 && (
        <DashboardSection id="recent-h" title="Recent bookings" href="/history" hrefLabel="Full history">
          <div className="space-y-3">
            {recent.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </div>
        </DashboardSection>
      )}

      {saved.length > 0 && (
        <DashboardSection id="saved-h" title="Saved spaces" href="/saved">
          <div className="grid gap-4 sm:grid-cols-2">
            {saved.map((s) => (
              <ParkingCard key={s.id} space={s} />
            ))}
          </div>
        </DashboardSection>
      )}

    </div>
  );
}
