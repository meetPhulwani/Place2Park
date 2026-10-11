import * as React from "react";
import Link from "@/components/link";
import { api } from "@/services/api";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpaceStatusBadge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, formatDate } from "@/lib/utils";

interface Metrics {
  users: number;
  activeListings: number;
  pendingListings: number;
  monthBookings: number;
  gmv: number;
  revenue: number;
  openReports: number;
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

  React.useEffect(() => {
    document.title = "Admin · Parkly";
    api.get("/admin/metrics").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Platform overview
        </h1>
        <p className="mt-1 text-sm text-slate-500">Key metrics across Parkly.</p>
      </div>

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
          hint="Service + platform fees"
        />
        <StatCard
          icon="Flag"
          label="Open reports"
          value={data.openReports}
          hint={data.openReports > 0 ? "Needs attention" : "All clear"}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Listings awaiting review</CardTitle>
          <Link href="/admin/listings?status=PENDING_REVIEW" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Review all
          </Link>
        </CardHeader>
        <CardContent>
          {data.pendingReview.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing waiting — nice.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.pendingReview.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/parking/${l.id}`}
                      className="truncate text-sm font-semibold text-slate-900 hover:text-brand-800"
                    >
                      {l.title}
                    </Link>
                    <p className="text-xs text-slate-400">
                      by {l.hostId?.name ?? "—"} · {l.area} · submitted {formatDate(l.createdAt)}
                    </p>
                  </div>
                  <SpaceStatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
