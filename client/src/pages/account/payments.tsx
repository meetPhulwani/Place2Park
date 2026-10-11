import * as React from "react";
import Link from "@/components/link";
import { CreditCard } from "lucide-react";
import { api } from "@/services/api";
import type { Payment } from "@/types";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime, formatINR } from "@/lib/utils";

const statusVariant: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  PAID: "success",
  CREATED: "warning",
  FAILED: "danger",
  REFUNDED: "neutral",
};

export default function PaymentsPage() {
  const [payments, setPayments] = React.useState<Payment[] | null>(null);

  React.useEffect(() => {
    document.title = "Payments · Parkly";
    api.get("/payments").then(({ data }) => setPayments(data.data.payments)).catch(() => setPayments([]));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-500">All transactions on your account.</p>
      </div>
      {payments === null ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : payments.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No payments yet"
          description="Payments appear here after your first booking."
        />
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
                <th className="px-5 py-3.5 font-medium">Booking</th>
                <th className="px-5 py-3.5 font-medium">Date</th>
                <th className="px-5 py-3.5 font-medium">Amount</th>
                <th className="px-5 py-3.5 font-medium">Method</th>
                <th className="px-5 py-3.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-5 py-3.5">
                    <Link
                      href={`/bookings/${p.bookingId}`}
                      className="font-medium text-slate-900 hover:text-brand-800"
                    >
                      {p.bookingCode}
                    </Link>
                    <p className="max-w-[220px] truncate text-xs text-slate-400">{p.spaceTitle}</p>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">{formatDateTime(p.createdAt)}</td>
                  <td className="px-5 py-3.5 font-semibold text-slate-900">{formatINR(p.amount)}</td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {p.provider === "MOCK" ? "Mock (dev)" : (p.method ?? "—")}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge variant={statusVariant[p.status] ?? "neutral"}>{p.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
