import * as React from "react";
import { api } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/stat-card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatINR } from "@/lib/utils";

interface AdminPayment {
  id: string;
  amount: number;
  provider: string;
  status: string;
  createdAt: string;
  bookingCode: string;
  driverName: string;
  spaceTitle: string;
}

interface PaymentsData {
  payments: AdminPayment[];
  collected: number;
  refunded: number;
  failedCount: number;
}

export default function AdminPaymentsPage() {
  const [data, setData] = React.useState<PaymentsData | null>(null);

  React.useEffect(() => {
    document.title = "Payments — Admin · Parkly";
    api.get("/admin/payments").then(({ data: d }) => setData(d.data)).catch(() => undefined);
  }, []);

  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">Latest 100 transactions.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="IndianRupee" label="Collected" value={formatINR(data.collected)} />
        <StatCard icon="History" label="Refunded" value={formatINR(data.refunded)} />
        <StatCard icon="Flag" label="Failed payments" value={data.failedCount} />
      </div>

      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3.5 font-medium">Booking</th>
              <th className="px-5 py-3.5 font-medium">Driver</th>
              <th className="px-5 py-3.5 font-medium">Created</th>
              <th className="px-5 py-3.5 font-medium">Provider</th>
              <th className="px-5 py-3.5 font-medium">Amount</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3">
                  <p className="font-medium text-slate-900">{p.bookingCode}</p>
                  <p className="max-w-[200px] truncate text-xs text-slate-400">{p.spaceTitle}</p>
                </td>
                <td className="px-5 py-3 text-slate-600">{p.driverName}</td>
                <td className="px-5 py-3 text-slate-500">{formatDateTime(p.createdAt)}</td>
                <td className="px-5 py-3">
                  <Badge variant={p.provider === "MOCK" ? "outline" : "info"}>{p.provider}</Badge>
                </td>
                <td className="px-5 py-3 font-semibold text-slate-900">{formatINR(p.amount)}</td>
                <td className="px-5 py-3">
                  <Badge
                    variant={
                      p.status === "PAID"
                        ? "success"
                        : p.status === "FAILED"
                          ? "danger"
                          : p.status === "REFUNDED"
                            ? "neutral"
                            : "warning"
                    }
                  >
                    {p.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
