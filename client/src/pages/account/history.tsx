import * as React from "react";
import Link from "@/components/link";
import { useSearchParams } from "react-router-dom";
import { History as HistoryIcon, MapPin, Search } from "lucide-react";
import { api } from "@/services/api";
import type { Booking, BookingSpaceRef } from "@/types";
import { BookingStatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewDialog } from "@/components/review-dialog";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getDisplayLocation } from "@/lib/location";
import { formatDate, formatDuration, formatINR, formatTime } from "@/lib/utils";

export default function HistoryPage() {
  const [params, setParams] = useSearchParams();
  const [data, setData] = React.useState<{ bookings: Booking[]; total: number; totalPages: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  const sp = {
    q: params.get("q") ?? undefined,
    status: params.get("status") ?? undefined,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
    page: Math.max(1, Number(params.get("page")) || 1),
  };

  const paramString = params.toString();
  React.useEffect(() => {
    document.title = "Parking history · Parkly";
    const qs = new URLSearchParams(paramString);
    qs.set("scope", "history");
    setData(null);
    setError(null);
    api
      .get(`/bookings?${qs.toString()}`)
      .then(({ data: d }) => setData(d.data))
      .catch(() => setError("Couldn't load your parking history."));
  }, [paramString, reloadKey]);

  const qs = (p: number) => {
    const next = new URLSearchParams();
    if (sp.q) next.set("q", sp.q);
    if (sp.status) next.set("status", sp.status);
    if (sp.from) next.set("from", sp.from);
    if (sp.to) next.set("to", sp.to);
    next.set("page", String(p));
    return `/history?${next.toString()}`;
  };

  const bookings = data?.bookings ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const page = sp.page;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Parking history
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {data ? `${total} past booking${total === 1 ? "" : "s"}` : "Loading…"}
        </p>
      </div>

      <HistoryFilters
        defaults={{ q: sp.q, status: sp.status, from: sp.from, to: sp.to }}
        onApply={(f) => {
          const next = new URLSearchParams();
          if (f.q) next.set("q", f.q);
          if (f.status) next.set("status", f.status);
          if (f.from) next.set("from", f.from);
          if (f.to) next.set("to", f.to);
          setParams(next, { replace: true });
        }}
      />

      {error && (
        <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {data === null && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
      ) : error ? null : bookings.length === 0 ? (
        <EmptyState
          icon={HistoryIcon}
          title="No history found"
          description={
            sp.q || sp.status || sp.from
              ? "Try clearing your filters."
              : "Completed and cancelled bookings will appear here."
          }
        />
      ) : (
        <ul className="space-y-3" role="list">
          {bookings.map((b) => {
            const space = b.spaceId as BookingSpaceRef;
            return (
              <li
                key={b.id}
                className="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div className="min-w-0">
                  <Link
                    href={`/bookings/${b.id}`}
                    className="text-[15px] font-semibold text-slate-900 hover:text-brand-800"
                  >
                    {space?.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3.5" aria-hidden />
                      {getDisplayLocation(space ?? {})}
                    </span>
                    <span aria-hidden>·</span>
                    {formatDate(b.start)}, {formatTime(b.start)}
                    <span aria-hidden>·</span>
                    {formatDuration(b.durationMins)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-900">{formatINR(b.totalAmount)}</span>
                  <BookingStatusBadge status={b.status} />
                  {b.status === "COMPLETED" &&
                    (b.reviewed ? (
                      <span className="text-sm text-slate-400">Reviewed ★</span>
                    ) : (
                      <ReviewDialog
                        bookingId={b.id}
                        spaceTitle={space?.title ?? ""}
                        onReviewed={() => setReloadKey((k) => k + 1)}
                      />
                    ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 && (
            <Link
              href={qs(page - 1)}
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              ← Previous
            </Link>
          )}
          <span className="px-3 text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={qs(page + 1)}
              className="rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function HistoryFilters({
  defaults,
  onApply,
}: {
  defaults: { q?: string; status?: string; from?: string; to?: string };
  onApply: (f: { q?: string; status?: string; from?: string; to?: string }) => void;
}) {
  const [q, setQ] = React.useState(defaults.q ?? "");
  const [status, setStatus] = React.useState(defaults.status ?? "");
  const [from, setFrom] = React.useState(defaults.from ?? "");
  const [to, setTo] = React.useState(defaults.to ?? "");

  function apply(e?: React.FormEvent) {
    e?.preventDefault();
    onApply({ q: q.trim() || undefined, status: status || undefined, from: from || undefined, to: to || undefined });
  }

  return (
    <form
      onSubmit={apply}
      className="glass grid gap-3 rounded-2xl p-4 sm:grid-cols-[1.5fr_1fr_1fr_1fr_auto]"
      role="search"
      aria-label="Filter history"
    >
      <div>
        <label htmlFor="h-q" className="sr-only">Search location</label>
        <Input
          id="h-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by place or area"
        />
      </div>
      <div>
        <label htmlFor="h-status" className="sr-only">Status</label>
        <Select id="h-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="EXPIRED">Expired</option>
        </Select>
      </div>
      <div>
        <label htmlFor="h-from" className="sr-only">From date</label>
        <Input id="h-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div>
        <label htmlFor="h-to" className="sr-only">To date</label>
        <Input id="h-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      <Button type="submit" variant="secondary">
        <Search className="size-4" aria-hidden />
        Apply
      </Button>
    </form>
  );
}
