import * as React from "react";
import Link from "@/components/link";
import { Building2, Flag, Users, Wallet } from "lucide-react";
import { api } from "@/services/api";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpaceStatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate } from "@/lib/utils";
import { ListingModeration } from "@/components/listing-moderation";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { DashboardLoadError } from "@/components/dashboard/load-error";

interface Metrics {
  users: number;
  activeListings: number;
  pendingListings: number;
  monthBookings: number;
  gmv: number;
  revenue: number;
  openReports: number;
  pendingPayouts?: number;
  pendingReview: {
    id: string;
    title: string;
    area: string;
    status: string;
    createdAt: string;
    hostId: { name?: string } | null;
  }[];
}

export default function AdminDashboardPage() {
  const [data, setData] = React.useState<Metrics | null>(null);
  const [failed, setFailed] = React.useState(false);

  const load = React.useCallback(() => {
    setFailed(false);
    api
      .get("/admin/metrics")
      .then(({ data: d }) => setData(d.data))
      .catch(() => setFailed(true));
  }, []);

  React.useEffect(() => {
    document.title = "Admin · Parkly";
    load();
  }, [load]);

  if (!data && failed) {
    return <DashboardLoadError onRetry={load} />;
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardHeader title="Platform overview" description="Live metrics and listings that need a decision." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon="Users" label="Total users" value={data.users} />
        <StatCard
          icon="Building2"
          label="Active listings"
          value={data.activeListings}
          hint={data.pendingListings > 0 ? `${data.pendingListings} awaiting review` : "None awaiting review"}
        />
        <StatCard icon="CalendarClock" label="Bookings this month" value={data.monthBookings} />
        <StatCard icon="IndianRupee" label="Gross booking value" value={formatINR(data.gmv)} />
        <StatCard
          icon="ShieldCheck"
          label="Platform revenue"
          value={formatINR(data.revenue)}
          hint="Driver 5% + host 10% stored on bookings"
        />
        <StatCard
          icon="Flag"
          label="Open reports"
          value={data.openReports}
          hint={data.openReports > 0 ? "Needs attention" : "All clear"}
        />
        <Link href="/admin/payouts" className="block sm:col-span-2 xl:col-span-1">
          <StatCard
            icon="Wallet"
            label="Payouts awaiting action"
            value={data.pendingPayouts ?? 0}
            hint="Requested or approved — not paid automatically"
          />
        </Link>
      </div>

      <QuickActions
        items={[
          { href: "/admin/users", label: "Users", icon: Users },
          { href: "/admin/listings", label: "Listings", icon: Building2 },
          { href: "/admin/payouts", label: "Payouts", icon: Wallet },
          { href: "/admin/reports", label: "Reports", icon: Flag },
        ]}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Listings awaiting review</CardTitle>
          <Link href="/admin/listings?status=PENDING_REVIEW" className="text-sm font-medium text-brand-600 hover:text-brand-800">
            Review all
          </Link>
        </CardHeader>
        <CardContent>
          {data.pendingReview.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting — nice.</p>
          ) : (
            <ul className="divide-y divide-line">
              {data.pendingReview.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/listings?status=PENDING_REVIEW`}
                      className="truncate text-sm font-semibold text-ink hover:text-brand-800"
                    >
                      {l.title}
                    </Link>
                    <p className="text-xs text-muted">
                      by {l.hostId?.name ?? "—"} · {l.area} · submitted {formatDate(l.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <SpaceStatusBadge status={l.status} />
                    <ListingModeration spaceId={l.id} status={l.status} onChanged={load} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
