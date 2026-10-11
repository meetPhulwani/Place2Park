import * as React from "react";
import { api } from "@/services/api";
import { BookingStatusBadge, Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatINR, formatTime } from "@/lib/utils";

interface AdminBooking {
  id: string;
  code: string;
  start: string;
  end: string;
  totalAmount: number;
  status: string;
  userId: { name?: string; email?: string } | null;
  spaceId: { title?: string; area?: string } | null;
  payment: { status: string; provider: string } | null;
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = React.useState<AdminBooking[] | null>(null);

  React.useEffect(() => {
    document.title = "Bookings — Admin · Parkly";
    api.get("/admin/bookings").then(({ data }) => setBookings(data.data.bookings)).catch(() => setBookings([]));
  }, []);

  if (bookings === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Bookings</h1>
        <p className="mt-1 text-sm text-slate-500">Latest 100 bookings across the platform.</p>
      </div>
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-400">
              <th className="px-5 py-3.5 font-medium">ID</th>
              <th className="px-5 py-3.5 font-medium">Driver</th>
              <th className="px-5 py-3.5 font-medium">Parking</th>
              <th className="px-5 py-3.5 font-medium">When</th>
              <th className="px-5 py-3.5 font-medium">Total</th>
              <th className="px-5 py-3.5 font-medium">Payment</th>
              <th className="px-5 py-3.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => (
              <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-5 py-3 font-medium text-slate-900">{b.code}</td>
                <td className="px-5 py-3">
                  <p className="text-slate-700">{b.userId?.name}</p>
                  <p className="text-xs text-slate-400">{b.userId?.email}</p>
                </td>
                <td className="max-w-[200px] px-5 py-3">
                  <p className="truncate text-slate-700">{b.spaceId?.title}</p>
                  <p className="text-xs text-slate-400">{b.spaceId?.area}</p>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {formatDate(b.start)}
                  <span className="block text-xs text-slate-400">
                    {formatTime(b.start)} – {formatTime(b.end)}
                  </span>
                </td>
                <td className="px-5 py-3 font-semibold text-slate-900">{formatINR(b.totalAmount)}</td>
                <td className="px-5 py-3">
                  <Badge
                    variant={
                      b.payment?.status === "PAID"
                        ? "success"
                        : b.payment?.status === "REFUNDED"
                          ? "neutral"
                          : b.payment?.status === "FAILED"
                            ? "danger"
                            : "warning"
                    }
                  >
                    {b.payment?.status ?? "NONE"}
                  </Badge>
                </td>
                <td className="px-5 py-3">
                  <BookingStatusBadge status={b.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
