import * as React from "react";
import Link from "@/components/link";
import { Flag } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";
import { REPORT_REASON_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/utils";

interface AdminReport {
  id: string;
  reason: string;
  details: string | null;
  status: string;
  resolvedNote: string | null;
  createdAt: string;
  spaceId: { id: string; title: string; area: string; status: string } | null;
  reporterId: { name?: string; email?: string } | null;
}

export default function AdminReportsPage() {
  const [reports, setReports] = React.useState<AdminReport[] | null>(null);

  const load = React.useCallback(() => {
    api.get("/admin/reports").then(({ data }) => setReports(data.data.reports)).catch(() => setReports([]));
  }, []);

  React.useEffect(() => {
    document.title = "Reports — Admin · Place2Park";
    load();
  }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Reported listings
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Investigate reports, then resolve or dismiss them. Hide listings from the Listings tab if needed.
        </p>
      </div>
      {reports === null ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : reports.length === 0 ? (
        <EmptyState icon={Flag} title="No reports" description="User reports about listings will appear here." />
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        r.status === "OPEN" ? "danger" : r.status === "RESOLVED" ? "success" : "neutral"
                      }
                    >
                      {r.status}
                    </Badge>
                    <span className="text-sm font-semibold text-slate-900">
                      {REPORT_REASON_LABELS[r.reason as keyof typeof REPORT_REASON_LABELS] ?? r.reason}
                    </span>
                  </div>
                  {r.spaceId && (
                    <p className="mt-1.5 text-sm text-slate-600">
                      <Link href={`/parking/${r.spaceId.id}`} className="font-medium text-brand-700 hover:text-brand-800">
                        {r.spaceId.title}
                      </Link>{" "}
                      · {r.spaceId.area} · listing status: {r.spaceId.status}
                    </p>
                  )}
                  {r.details && (
                    <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">“{r.details}”</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">
                    Reported by {r.reporterId?.name} ({r.reporterId?.email}) · {formatDateTime(r.createdAt)}
                  </p>
                  {r.resolvedNote && (
                    <p className="mt-1 text-xs text-slate-400">Resolution note: {r.resolvedNote}</p>
                  )}
                </div>
                {r.status === "OPEN" && <ReportActions reportId={r.id} onChanged={load} />}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReportActions({ reportId, onChanged }: { reportId: string; onChanged: () => void }) {
  const [dialog, setDialog] = React.useState<null | "resolve" | "dismiss">(null);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit() {
    if (!dialog) return;
    setBusy(true);
    try {
      await api.post(`/admin/reports/${reportId}/resolve`, { action: dialog, note });
      toast.success(dialog === "resolve" ? "Report resolved." : "Report dismissed.");
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
      setDialog(null);
      setNote("");
    }
  }

  return (
    <div className="flex shrink-0 gap-2">
      <Button size="sm" onClick={() => setDialog("resolve")}>
        Resolve
      </Button>
      <Button variant="secondary" size="sm" onClick={() => setDialog("dismiss")}>
        Dismiss
      </Button>
      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog === "resolve" ? "Resolve report" : "Dismiss report"}
        description={
          dialog === "resolve"
            ? "Mark as resolved after taking action (e.g. hiding the listing or contacting the host)."
            : "Dismiss if the report doesn't require action."
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="rep-note" hint="(optional)">
              Internal note
            </Label>
            <Textarea
              id="rep-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What action was taken?"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Confirm
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
