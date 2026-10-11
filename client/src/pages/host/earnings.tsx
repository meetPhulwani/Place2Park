import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "@/services/api";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatINR } from "@/lib/utils";

interface EarningsData {
  total: number;
  platformFees: number;
  gross: number;
  completedCount: number;
  thisMonth: number;
  pending: number;
  pendingCount: number;
  monthly: { year: number; month: number; earning: number }[];
  payouts: {
    id: string;
    amount: number;
    periodStart: string;
    periodEnd: string;
    status: string;
    paidAt: string | null;
  }[];
}

export default function HostEarningsPage() {
  const [data, setData] = React.useState<EarningsData | null>(null);

  React.useEffect(() => {
    document.title = "Earnings · Parkly";
    api.get("/host/earnings").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  // Last 6 calendar months chart buckets
  const now = new Date();
  const buckets: { label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const entry = data.monthly.find((m) => m.year === d.getFullYear() && m.month === d.getMonth() + 1);
    buckets.push({
      label: d.toLocaleDateString("en-IN", { month: "short" }),
      total: entry?.earning ?? 0,
    });
  }
  const maxBucket = Math.max(1, ...buckets.map((b) => b.total));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Earnings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Net of the 15% platform fee. Payouts are settled weekly.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="IndianRupee"
          label="Total earned"
          value={formatINR(data.total)}
          hint={`${data.completedCount} completed bookings`}
        />
        <StatCard icon="Wallet" label="This month" value={formatINR(data.thisMonth)} />
        <StatCard
          icon="CalendarClock"
          label="Pending"
          value={formatINR(data.pending)}
          hint={`${data.pendingCount} upcoming/in-progress`}
        />
        <StatCard
          icon="Percent"
          label="Platform fees paid"
          value={formatINR(data.platformFees)}
          hint="15% of completed bookings"
        />
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Completed earnings — last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex h-48 items-end gap-3 sm:gap-6"
            role="img"
            aria-label={`Bar chart of monthly earnings: ${buckets.map((b) => `${b.label} ${formatINR(b.total)}`).join(", ")}`}
          >
            {buckets.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">
                  {b.total > 0 ? formatINR(b.total) : ""}
                </span>
                <div
                  className="w-full max-w-16 rounded-t-lg bg-brand-600 transition-all"
                  style={{ height: `${Math.max(4, (b.total / maxBucket) * 140)}px` }}
                />
                <span className="text-xs text-slate-400">{b.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Payouts */}
      <Card>
        <CardHeader>
          <CardTitle>Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payouts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No payouts yet. Once bookings complete, weekly payouts appear here.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{formatINR(p.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {formatDate(p.periodStart)} – {formatDate(p.periodEnd)}
                    </p>
                  </div>
                  {p.status === "PAID" ? (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" aria-hidden />
                      Paid {p.paidAt ? formatDate(p.paidAt) : ""}
                    </Badge>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
