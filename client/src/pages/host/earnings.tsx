import * as React from "react";
import Link from "@/components/link";
import { CheckCircle2 } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatINR } from "@/lib/utils";

interface EarningsData {
  calculatedCompleted: number;
  total: number;
  platformFees: number;
  completedCount: number;
  thisMonth: number;
  upcomingEarnings: number;
  pending: number;
  pendingCount: number;
  eligibleAmount: number;
  eligibleCount: number;
  pendingTransferAmount: number;
  pendingTransferCount: number;
  paidAmount: number;
  paidCount: number;
  monthly: { year: number; month: number; earning: number }[];
  payoutMethod: string;
  automaticTransfers: boolean;
  payoutProfile: { submitted: boolean; verified: boolean; accountLast4?: string };
  payouts: {
    id: string;
    amount: number;
    status: string;
    reference?: string;
    periodStart?: string;
    periodEnd?: string;
    requestedAt?: string;
    paidAt?: string | null;
  }[];
}

function payoutLabel(status: string) {
  if (status === "PAID") return "Paid out";
  if (status === "APPROVED") return "Approved — waiting for transfer";
  if (status === "REQUESTED") return "Requested — awaiting admin";
  if (status === "FAILED") return "Failed";
  if (status === "REJECTED") return "Rejected";
  if (status === "REVERSED") return "Reversed";
  return status;
}

export default function HostEarningsPage() {
  const [data, setData] = React.useState<EarningsData | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    api.get("/host/earnings").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  React.useEffect(() => {
    document.title = "Earnings · Place2Park";
    load();
  }, [load]);

  async function requestPayout() {
    setBusy(true);
    try {
      await api.post("/host/payouts/request");
      toast.success("Payout requested. An admin will review it before any money is sent.");
      load();
    } catch (e) {
      toast.error(errorMessage(e, "Could not request a payout."));
    } finally {
      setBusy(false);
    }
  }

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
          Calculated earnings use the stored host share (90% of the parking fee on new
          bookings). Completed bookings are not paid out automatically. Payouts are manual
          after admin approval. Historical bookings keep the amounts saved at checkout.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon="IndianRupee"
          label="Calculated completed"
          value={formatINR(data.calculatedCompleted ?? data.total)}
          hint={`${data.completedCount} completed bookings · not a bank payout`}
        />
        <StatCard
          icon="Wallet"
          highlight
          label="Eligible to request"
          value={formatINR(data.eligibleAmount)}
          hint={`${data.eligibleCount} completed booking${data.eligibleCount === 1 ? "" : "s"} ready`}
        />
        <StatCard
          icon="CalendarClock"
          label="Pending transfers"
          value={formatINR(data.pendingTransferAmount)}
          hint={`${data.pendingTransferCount} request${data.pendingTransferCount === 1 ? "" : "s"} in review`}
        />
        <StatCard
          icon="ShieldCheck"
          label="Paid out"
          value={formatINR(data.paidAmount)}
          hint={`${data.paidCount} completed payout${data.paidCount === 1 ? "" : "s"}`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon="CalendarClock"
          label="Upcoming (not eligible yet)"
          value={formatINR(data.upcomingEarnings ?? data.pending)}
          hint={`${data.pendingCount} confirmed or active bookings`}
        />
        <StatCard
          icon="Percent"
          label="Platform fees (calculated)"
          value={formatINR(data.platformFees)}
          hint="Host commission stored on completed bookings"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Request a payout</CardTitle>
          {!data.payoutProfile.verified && (
            <Link href="/host/settings" className="text-sm font-medium text-brand-700">
              Add bank details
            </Link>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            {data.automaticTransfers
              ? "Automatic transfers are not enabled for this account."
              : "Razorpay Route is not used. An admin pays eligible earnings after reviewing your request."}
          </p>
          <Button
            disabled={busy || data.eligibleAmount <= 0 || !data.payoutProfile.verified}
            onClick={() => void requestPayout()}
          >
            Request {data.eligibleAmount > 0 ? formatINR(data.eligibleAmount) : "payout"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calculated completed earnings — last 6 months</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex h-48 items-end gap-3 sm:gap-6"
            role="img"
            aria-label={`Bar chart of monthly calculated earnings: ${buckets.map((b) => `${b.label} ${formatINR(b.total)}`).join(", ")}`}
          >
            {buckets.map((b) => (
              <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-medium text-slate-600">
                  {b.total > 0 ? formatINR(b.total) : ""}
                </span>
                <div
                  className="w-full max-w-16 rounded-t-lg bg-brand-500 transition-all"
                  style={{ height: `${Math.max(4, (b.total / maxBucket) * 140)}px` }}
                />
                <span className="text-xs text-slate-400">{b.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout records</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payouts.length === 0 ? (
            <p className="text-sm text-slate-500">
              No payout requests yet. Eligible completed bookings can be requested after your bank
              details are verified.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.payouts.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-slate-900">{formatINR(p.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {p.periodStart && p.periodEnd
                        ? `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}`
                        : p.requestedAt
                          ? formatDate(p.requestedAt)
                          : ""}
                      {p.reference ? ` · ref ${p.reference}` : ""}
                    </p>
                  </div>
                  {p.status === "PAID" ? (
                    <Badge variant="success">
                      <CheckCircle2 className="size-3" aria-hidden />
                      Paid {p.paidAt ? formatDate(p.paidAt) : ""}
                    </Badge>
                  ) : (
                    <Badge variant={p.status === "FAILED" || p.status === "REJECTED" ? "danger" : "warning"}>
                      {payoutLabel(p.status)}
                    </Badge>
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
