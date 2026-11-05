import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import Link from "@/components/link";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_LABEL } from "@/lib/support-labels";
import { consoleApi, errorMessage } from "@/services/console-api";

type Row = { id: string; kind: string; reference: string; type: string; category: string; status: string; createdAt: string };

export default function AdminSupportPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState("");

  function load(params: URLSearchParams) {
    setRows(null);
    consoleApi.get(`/support?${params.toString()}`).then(({ data }) => setRows(data.data.cases as Row[])).catch((err) => {
      setRows([]);
      setError(errorMessage(err, "Couldn't load tickets."));
    });
  }

  useEffect(() => {
    document.title = "Support desk · Place2Park";
    load(new URLSearchParams());
  }, []);

  return (
    <div className="space-y-6">
      <DashboardHeader title="Support desk" description="User reports and Place2Park tickets. A report does not suspend anyone." />
      <form
        className="grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          const params = new URLSearchParams();
          if (q) params.set("q", q);
          if (kind) params.set("kind", kind);
          if (status) params.set("status", status);
          if (category) params.set("category", category);
          if (from) params.set("from", new Date(from).toISOString());
          if (to) params.set("to", new Date(to).toISOString());
          load(params);
        }}
      >
        <input className="h-10 rounded-lg border border-line px-3 text-sm" placeholder="Reference, email, or booking" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="h-10 rounded-lg border border-line px-3 text-sm" value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">All types</option>
          <option value="USER_REPORT">User report</option>
          <option value="SUPPORT">Support ticket</option>
        </select>
        <select className="h-10 rounded-lg border border-line px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        <input className="h-10 rounded-lg border border-line px-3 text-sm" placeholder="Category code" value={category} onChange={(e) => setCategory(e.target.value)} />
        <input type="date" className="h-10 rounded-lg border border-line px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="h-10 rounded-lg border border-line px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
        <Button type="submit" className="sm:col-span-3">Search</Button>
      </form>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="h-40 animate-pulse rounded-xl bg-line" />
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No matching tickets" description="Try a reference number, email, or a wider date range." />
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link href={`/support/${row.kind}/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3">
                <span>
                  <span className="font-semibold text-ink">{row.reference}</span>
                  <span className="ml-2 text-sm text-muted">{row.type} · {row.category}</span>
                </span>
                <Badge variant="brand">{STATUS_LABEL[row.status] ?? row.status}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
