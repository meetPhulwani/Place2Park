import { useEffect, useState } from "react";
import { Inbox } from "lucide-react";
import Link from "@/components/link";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { STATUS_LABEL, SUPPORT_TOPICS, DRIVER_REPORTS, HOST_REPORTS, labelOf } from "@/lib/support-labels";
import { api } from "@/services/api";

type Row = {
  id: string;
  kind: "USER_REPORT" | "SUPPORT";
  reference: string;
  type: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  resolutionNote?: string;
};

function categoryLabel(kind: string, category: string) {
  const list = kind === "SUPPORT" ? SUPPORT_TOPICS : [...DRIVER_REPORTS, ...HOST_REPORTS];
  return labelOf(list, category);
}

export default function MyTicketsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "My reports & tickets · Place2Park";
    api.get("/support/mine").then(({ data }) => setRows(data.data.cases as Row[])).catch(() => {
      setRows([]);
      setError("Couldn't load your tickets.");
    });
  }, []);
  return (
    <div className="space-y-6">
      <DashboardHeader title="My reports & tickets" description="Reference numbers, status, and the latest update." />
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-line" />)}</div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Inbox} title="No tickets yet" description="Reports and support requests you submit will show up here." />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={`${row.kind}-${row.id}`}>
              <Link href={`/help/tickets/${row.kind}/${row.id}`} className="block rounded-xl border border-line bg-white p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink">{row.reference}</p>
                  <Badge variant={row.status === "RESOLVED" ? "success" : row.status === "AWAITING_USER" ? "warning" : "brand"}>{STATUS_LABEL[row.status] ?? row.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted">{row.type} · {categoryLabel(row.kind, row.category)}</p>
                <p className="mt-1 text-xs text-muted">Submitted {new Date(row.createdAt).toLocaleString()} · Updated {new Date(row.updatedAt).toLocaleString()}</p>
                {row.resolutionNote && <p className="mt-2 text-sm text-ink">{row.resolutionNote}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
