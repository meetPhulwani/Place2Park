import * as React from "react";
import Link from "@/components/link";
import { consoleApi } from "@/services/console-api";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceStatusBadge } from "@/components/ui/badge";
import { ListingModeration } from "@/components/listing-moderation";
import { DashboardLoadError } from "@/components/dashboard/load-error";
import { formatDate, formatINR } from "@/lib/utils";

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

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  bookingCode: string;
  driverName: string;
  spaceTitle: string;
}

interface AuditRow {
  id: string;
  action: string;
  outcome: string;
  createdAt: string;
}

function Bars({ rows }: { rows: { label: string; display: string; value: number; tone: "blue" | "volt" }[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-[#111827]">{row.label}</span>
            <span className="tabular-nums text-[#0251B0]">{row.display}</span>
          </div>
          <div className="p2p-bar" aria-hidden>
            <span style={{ width: `${Math.max(4, (row.value / max) * 100)}%`, background: row.tone === "volt" ? "#D1FF42" : "#0251B0" }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function AdminDashboardPage() {
  const [data, setData] = React.useState<Metrics | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [payments, setPayments] = React.useState<PaymentRow[] | null>(null);
  const [paymentsNote, setPaymentsNote] = React.useState("");
  const [audits, setAudits] = React.useState<AuditRow[] | null>(null);
  const [health, setHealth] = React.useState<"checking" | "ok" | "down">("checking");

  const load = React.useCallback(() => {
    setFailed(false);
    setData(null);
    consoleApi.get("/metrics").then(({ data: body }) => setData(body.data)).catch(() => setFailed(true));
    consoleApi.get("/payments").then(({ data: body }) => {
      setPayments((body.data.payments as PaymentRow[]).slice(0, 6));
      setPaymentsNote("");
    }).catch((err: { response?: { status?: number } }) => {
      setPayments([]);
      setPaymentsNote(err.response?.status === 403 ? "Payments are not available for this role." : "Payments could not be loaded.");
    });
    consoleApi.get("/audits").then(({ data: body }) => {
      const rows = (body.data.audits as Array<{ _id: string; action: string; outcome: string; createdAt: string }>).slice(0, 6);
      setAudits(rows.map((row) => ({ id: row._id, action: row.action, outcome: row.outcome, createdAt: row.createdAt })));
    }).catch(() => setAudits([]));
    fetch("/api/health")
      .then((response) => setHealth(response.ok ? "ok" : "down"))
      .catch(() => setHealth("down"));
  }, []);

  React.useEffect(() => {
    document.title = "Overview · Place2Park Console";
    load();
  }, [load]);

  if (!data && failed) return <DashboardLoadError onRetry={load} />;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  const stats = [
    ["Total users", String(data.users)],
    ["Active listings", String(data.activeListings)],
    ["Bookings this month", String(data.monthBookings)],
    ["Platform revenue", formatINR(data.revenue)],
    ["Pending payouts", String(data.pendingPayouts ?? 0)],
    ["Open reports", String(data.openReports)],
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Overview</p>
          <h1 className="mt-1 text-3xl font-bold">Platform overview</h1>
          <p className="mt-1 text-sm text-[#64748b]">Figures come from the live console metrics, payments, and audit APIs.</p>
        </div>
        <span className="rounded-full bg-[#D1FF42] px-3 py-1 text-xs font-bold text-[#111827]">
          {health === "checking" ? "Checking API" : health === "ok" ? "API responding" : "API unavailable"}
        </span>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map(([label, value], index) => (
          <article key={label} className="p2p-card p-5">
            <p className="text-sm text-[#64748b]">{label}</p>
            <p className="mt-2 font-display text-3xl font-bold tracking-tight text-[#0251B0]">{value}</p>
            {index === 1 && <p className="mt-2 text-xs text-[#64748b]">{data.pendingListings} awaiting review</p>}
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="p2p-card p-5">
          <h2 className="font-display text-lg font-bold">Revenue</h2>
          <p className="mb-4 text-xs text-[#64748b]">Confirmed, active, and completed bookings.</p>
          <Bars
            rows={[
              { label: "Gross booking value", display: formatINR(data.gmv), value: data.gmv, tone: "blue" },
              { label: "Platform revenue", display: formatINR(data.revenue), value: data.revenue, tone: "volt" },
            ]}
          />
        </article>
        <article className="p2p-card p-5">
          <h2 className="font-display text-lg font-bold">Activity</h2>
          <p className="mb-4 text-xs text-[#64748b]">Current counts. No estimated history is shown.</p>
          <Bars
            rows={[
              { label: "Users", display: String(data.users), value: data.users, tone: "blue" },
              { label: "Active listings", display: String(data.activeListings), value: data.activeListings, tone: "volt" },
              { label: "Bookings this month", display: String(data.monthBookings), value: data.monthBookings, tone: "blue" },
              { label: "Pending payouts", display: String(data.pendingPayouts ?? 0), value: data.pendingPayouts ?? 0, tone: "volt" },
            ]}
          />
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="p2p-card p-5 xl:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent payments</h2>
            <Link href="/payments" className="text-sm font-semibold text-[#0251B0]">View all</Link>
          </div>
          {payments === null ? <Skeleton className="h-28" /> : payments.length === 0 ? (
            <p className="text-sm text-[#64748b]">{paymentsNote || "No payments recorded."}</p>
          ) : (
            <ul className="divide-y divide-[#E2E8F0]">
              {payments.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                  <div>
                    <p className="font-medium">{row.spaceTitle || row.bookingCode || "Payment"}</p>
                    <p className="text-xs text-[#64748b]">{row.driverName || "Driver"} · {formatDate(row.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-[#0251B0]">{formatINR(row.amount)}</p>
                    <p className="text-xs uppercase tracking-wide text-[#64748b]">{row.status}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="p2p-card p-5">
          <h2 className="font-display text-lg font-bold">System</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex justify-between"><span>API health</span><span className="font-semibold">{health}</span></li>
            <li className="flex justify-between"><span>Open reports</span><span className="font-semibold">{data.openReports}</span></li>
            <li className="flex justify-between"><span>Listings in review</span><span className="font-semibold">{data.pendingListings}</span></li>
            <li className="flex justify-between"><span>Payouts waiting</span><span className="font-semibold">{data.pendingPayouts ?? 0}</span></li>
          </ul>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="p2p-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Pending listing approvals</h2>
            <Link href="/listings?status=PENDING_REVIEW" className="text-sm font-semibold text-[#0251B0]">Review</Link>
          </div>
          {data.pendingReview.length === 0 ? <p className="text-sm text-[#64748b]">No listings are waiting.</p> : (
            <ul className="divide-y divide-[#E2E8F0]">
              {data.pendingReview.map((listing) => (
                <li key={listing.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{listing.title}</p>
                    <p className="text-xs text-[#64748b]">{listing.hostId?.name ?? "Host"} · {listing.area} · {formatDate(listing.createdAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SpaceStatusBadge status={listing.status} />
                    <ListingModeration spaceId={listing.id} status={listing.status} onChanged={load} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="p2p-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent admin activity</h2>
            <Link href="/audits" className="text-sm font-semibold text-[#0251B0]">Audit log</Link>
          </div>
          {audits === null ? <Skeleton className="h-28" /> : audits.length === 0 ? <p className="text-sm text-[#64748b]">No audit events yet.</p> : (
            <ul className="space-y-2">
              {audits.map((row) => (
                <li key={row.id} className="rounded-xl bg-[#F3F5F7] px-3 py-2 text-sm">
                  <span className="font-medium text-[#0251B0]">{row.action}</span>
                  <span className="text-[#64748b]"> · {row.outcome} · {formatDate(row.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  );
}
