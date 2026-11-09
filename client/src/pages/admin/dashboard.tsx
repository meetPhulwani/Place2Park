import * as React from "react";
import Link from "@/components/link";
import { Building2, CalendarClock, Users, Wallet } from "lucide-react";
import { consoleApi } from "@/services/console-api";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardLoadError } from "@/components/dashboard/load-error";
import { formatDateTime, formatINR } from "@/lib/utils";
import { TrendChart, type ChartPoint } from "@/admin-app/trend-chart";

interface Metrics {
  users: number;
  activeListings: number;
  pendingListings: number;
  monthBookings: number;
  gmv: number;
  revenue: number;
  openReports: number;
  pendingPayouts?: number;
}

interface BookingRow {
  id: string;
  createdAt?: string;
  start: string;
  status: string;
  totalAmount: number;
  serviceFee?: number;
  platformFee?: number;
  code?: string;
  userId?: { name?: string } | null;
}

interface PayoutRow {
  amount: number;
  status: string;
  requestedAt?: string;
}

interface AuditRow {
  id: string;
  action: string;
  outcome: string;
  createdAt: string;
  target?: string;
}

const RANGES = [
  { id: 7, label: "7 days" },
  { id: 30, label: "30 days" },
  { id: 90, label: "90 days" },
] as const;

const REVENUE_STATUSES = new Set(["CONFIRMED", "ACTIVE", "COMPLETED"]);
const OPEN_TICKETS = new Set(["OPEN", "UNDER_REVIEW", "AWAITING_USER"]);

function dayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function within(value: string | undefined, days: number) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  return time >= Date.now() - days * 86_400_000;
}

export default function AdminDashboardPage() {
  const [data, setData] = React.useState<Metrics | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [bookings, setBookings] = React.useState<BookingRow[] | null>(null);
  const [payouts, setPayouts] = React.useState<PayoutRow[] | null>(null);
  const [audits, setAudits] = React.useState<AuditRow[] | null>(null);
  const [openTickets, setOpenTickets] = React.useState<number | null>(null);
  const [range, setRange] = React.useState<(typeof RANGES)[number]["id"]>(30);

  const load = React.useCallback(() => {
    setFailed(false);
    setData(null);
    consoleApi.get("/metrics").then(({ data: body }) => setData(body.data)).catch(() => setFailed(true));
    consoleApi.get("/bookings").then(({ data: body }) => setBookings(body.data.bookings as BookingRow[])).catch(() => setBookings([]));
    consoleApi.get("/payouts").then(({ data: body }) => setPayouts(body.data.payouts as PayoutRow[])).catch(() => setPayouts(null));
    consoleApi.get("/audits").then(({ data: body }) => {
      const rows = (body.data.audits as Array<{ _id: string; action: string; outcome: string; createdAt: string; target?: string }>).slice(0, 8);
      setAudits(rows.map((row) => ({ id: row._id, action: row.action, outcome: row.outcome, createdAt: row.createdAt, target: row.target })));
    }).catch(() => setAudits([]));
    consoleApi.get("/support").then(({ data: body }) => {
      const rows = body.data.cases as Array<{ status: string }>;
      setOpenTickets(rows.filter((row) => OPEN_TICKETS.has(row.status)).length);
    }).catch(() => setOpenTickets(null));
  }, []);

  React.useEffect(() => {
    document.title = "Dashboard · Place2Park Console";
    load();
  }, [load]);

  if (!data && failed) return <DashboardLoadError onRetry={load} />;
  if (!data || !bookings) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-2xl" />)}
      </div>
    );
  }

  const recent = bookings.filter((row) => within(row.createdAt || row.start, range));
  const days = new Map<string, { bookings: number; gmv: number; revenue: number; payouts: number }>();
  for (const row of recent) {
    const key = dayKey(row.createdAt || row.start);
    if (!key) continue;
    const bucket = days.get(key) ?? { bookings: 0, gmv: 0, revenue: 0, payouts: 0 };
    bucket.bookings += 1;
    if (REVENUE_STATUSES.has(row.status)) {
      bucket.gmv += row.totalAmount || 0;
      bucket.revenue += (row.serviceFee || 0) + (row.platformFee || 0);
    }
    days.set(key, bucket);
  }
  const payoutDays = new Map(days);
  for (const row of payouts ?? []) {
    if (!within(row.requestedAt, range)) continue;
    const key = dayKey(row.requestedAt || "");
    if (!key) continue;
    const bucket = payoutDays.get(key) ?? { bookings: 0, gmv: 0, revenue: 0, payouts: 0 };
    bucket.payouts += row.amount || 0;
    payoutDays.set(key, bucket);
  }
  const points: ChartPoint[] = [...days.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, bucket]) => ({ label, values: [bucket.bookings] }));
  const revenuePoints: ChartPoint[] = [...payoutDays.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, bucket]) => ({ label, values: [bucket.gmv, bucket.revenue, bucket.payouts] }));

  const cards = [
    { label: "Total users", value: String(data.users), icon: Users, href: "/users" },
    { label: "Active listings", value: String(data.activeListings), icon: Building2, href: "/listings" },
    { label: "Bookings this month", value: String(data.monthBookings), icon: CalendarClock, href: "/bookings" },
    { label: "Gross booking value", value: formatINR(data.gmv), icon: Wallet, href: "/payments" },
    { label: "Pending payouts", value: String(data.pendingPayouts ?? 0), icon: Wallet, href: "/payouts" },
  ];

  const operations = [
    { label: "Listings awaiting approval", value: data.pendingListings, href: "/listings?status=PENDING_REVIEW" },
    { label: "Pending payouts", value: data.pendingPayouts ?? 0, href: "/payouts" },
    { label: "Open support tickets", value: openTickets, href: "/support" },
    { label: "Open reports", value: data.openReports, href: "/reports" },
    { label: "Bookings in view", value: recent.length, href: "/bookings" },
  ];

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="p2p-card block p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[#64748b]">{card.label}</p>
              <card.icon className="size-4 text-[#0251B0]" aria-hidden />
            </div>
            <p className="mt-3 font-display text-3xl font-bold tracking-tight text-[#0251B0]">{card.value}</p>
          </Link>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="p2p-card p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold">Booking trends</h2>
              <p className="text-xs text-[#64748b]">Daily counts from the latest bookings returned by the console.</p>
            </div>
            <div className="flex gap-1">
              {RANGES.map((item) => (
                <button key={item.id} type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${range === item.id ? "bg-[#0251B0] text-white" : "bg-[#F3F5F7] text-[#111827]"}`} onClick={() => setRange(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <TrendChart points={points} series={[{ name: "Bookings", color: "#0251B0" }]} />
        </article>
        <article className="p2p-card p-5">
          <div className="mb-1">
            <h2 className="font-display text-lg font-bold">Revenue overview</h2>
            <p className="text-xs text-[#64748b]">Gross booking value, platform fees, and recorded host payouts. Totals on the cards above are platform-wide.</p>
          </div>
          <p className="mb-4 text-sm text-[#0251B0]">Platform revenue {formatINR(data.revenue)} · Gross booking value {formatINR(data.gmv)}</p>
          <TrendChart
            points={payouts === null ? revenuePoints.map((point) => ({ ...point, values: point.values.slice(0, 2) })) : revenuePoints}
            series={[
              { name: "Gross booking value", color: "#0251B0", format: formatINR },
              { name: "Platform revenue", color: "#B3E51A", format: formatINR },
              ...(payouts === null ? [] : [{ name: "Host payouts", color: "#013270", format: formatINR }]),
            ]}
          />
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
        <article className="p2p-card p-5">
          <h2 className="font-display text-lg font-bold">Operations</h2>
          <ul className="mt-3 divide-y divide-[#E2E8F0]">
            {operations.map((item) => (
              <li key={item.label}>
                <Link href={item.href} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-[#0251B0]">
                  <span>{item.label}</span>
                  <span className="font-semibold text-[#0251B0]">{item.value === null ? "—" : item.value}</span>
                </Link>
              </li>
            ))}
          </ul>
        </article>
        <article className="p2p-card overflow-x-auto p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold">Recent activity</h2>
            <Link href="/audits" className="text-sm font-semibold text-[#0251B0]">Audit log</Link>
          </div>
          {audits === null ? <Skeleton className="h-28" /> : audits.length === 0 ? <p className="text-sm text-[#64748b]">No audit events yet.</p> : (
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-[#64748b]">
                  <th className="py-2 font-medium">Activity</th>
                  <th className="py-2 font-medium">Target</th>
                  <th className="py-2 font-medium">When</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((row) => (
                  <tr key={row.id} className="border-t border-[#E2E8F0]">
                    <td className="py-3 font-medium">{row.action}</td>
                    <td className="py-3 text-[#64748b]">{row.target || "—"}</td>
                    <td className="py-3 text-[#64748b]">{formatDateTime(row.createdAt)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${row.outcome === "SUCCESS" ? "bg-[#D1FF42] text-[#111827]" : "bg-[#FEE2E2] text-[#991B1B]"}`}>{row.outcome}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </article>
      </section>
    </div>
  );
}
