import Link from "@/components/link";
import type { Booking } from "@/types";
import { Card } from "@/components/ui/card";
import { formatINR } from "@/lib/utils";

export function SpendingOverview({
  completed,
  totalSpent,
  recent,
}: {
  completed: number;
  totalSpent: number;
  recent: Booking[];
}) {
  const completedRecent = recent.filter((b) => b.status === "COMPLETED");
  const average = completed > 0 ? Math.round(totalSpent / completed) : 0;

  return (
    <Card className="flex h-full flex-col p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Spending</h2>
          <p className="mt-0.5 text-sm text-muted">Totals from completed bookings</p>
        </div>
        <Link href="/payments" className="text-sm font-medium text-brand-600 hover:text-brand-800">
          Payments
        </Link>
      </div>
      <p className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">{formatINR(totalSpent)}</p>
      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-page px-3 py-2.5">
          <dt className="text-xs text-muted">Completed</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{completed}</dd>
        </div>
        <div className="rounded-lg bg-page px-3 py-2.5">
          <dt className="text-xs text-muted">Average stay</dt>
          <dd className="mt-0.5 text-sm font-semibold text-ink">{completed > 0 ? formatINR(average) : "—"}</dd>
        </div>
      </dl>
      {completedRecent.length > 0 ? (
        <ul className="mt-4 divide-y divide-line border-t border-line">
          {completedRecent.map((b) => {
            const space = typeof b.spaceId === "object" ? b.spaceId : null;
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="truncate text-sm text-muted">{space?.title ?? b.code}</span>
                <span className="shrink-0 text-sm font-medium text-ink">{formatINR(b.totalAmount)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">
          {completed > 0
            ? "Recent completed stays will show here. Open Payments for the full history."
            : "Completed stays will appear here after your first trip."}
        </p>
      )}
    </Card>
  );
}
