import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatINR } from "@/lib/utils";

const STATUSES = ["ALL", "REQUESTED", "APPROVED", "PAID", "FAILED", "REJECTED", "REVERSED"];

interface AdminPayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference?: string;
  requestedAt?: string;
  paidAt?: string;
  hostId: { id: string; name?: string; email?: string };
  destination: {
    accountHolder: string;
    ifsc: string;
    accountLast4: string;
    accountNumber: string;
    verified: boolean;
  };
}

export default function AdminPayoutsPage() {
  const [params, setParams] = useSearchParams();
  const [payouts, setPayouts] = React.useState<AdminPayout[] | null>(null);
  const status = STATUSES.includes(params.get("status") ?? "") && params.get("status") !== "ALL"
    ? params.get("status")!
    : undefined;

  const load = React.useCallback(() => {
    api
      .get(`/admin/payouts${status ? `?status=${status}` : ""}`)
      .then(({ data }) => setPayouts(data.data.payouts))
      .catch(() => setPayouts([]));
  }, [status]);

  React.useEffect(() => {
    document.title = "Payouts — Admin · Parkly";
    load();
  }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Payouts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manual settlements only. Completed bookings are not paid automatically. Record the bank or
          UPI reference after you transfer funds outside Razorpay Route.
        </p>
      </div>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
        {STATUSES.map((s) => {
          const active = (status ?? "ALL") === s;
          return (
            <button
              key={s}
              onClick={() => setParams(s === "ALL" ? {} : { status: s }, { replace: true })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {s === "ALL" ? "All" : s.toLowerCase()}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3">
        {payouts === null && <Skeleton className="h-40 rounded-2xl" />}
        {payouts?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No payouts with this status.
          </p>
        )}
        {payouts?.map((p) => (
          <PayoutRow key={p.id} payout={p} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function PayoutRow({ payout, onChanged }: { payout: AdminPayout; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const [reference, setReference] = React.useState(payout.reference ?? "");

  async function act(path: string, body: Record<string, string>, msg: string) {
    setBusy(true);
    try {
      await api.post(`/admin/payouts/${payout.id}/${path}`, body);
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-slate-900">
            {formatINR(payout.amount)} {payout.currency}
          </p>
          <p className="text-sm text-slate-500">
            {payout.hostId.name} ({payout.hostId.email}) · requested {payout.requestedAt ? formatDate(payout.requestedAt) : "—"}
          </p>
          <p className="text-xs text-slate-400">
            {payout.destination.accountHolder} · {payout.destination.ifsc} ·
            {payout.destination.accountNumber
              ? ` ${payout.destination.accountNumber}`
              : ` ****${payout.destination.accountLast4}`}
            {payout.destination.verified ? " · verified" : " · unverified"}
          </p>
        </div>
        <Badge variant={payout.status === "PAID" ? "success" : payout.status === "FAILED" || payout.status === "REJECTED" ? "danger" : "warning"}>
          {payout.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {payout.status === "REQUESTED" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => act("approve", {}, "Payout approved.")}>
              Approve
            </Button>
            <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => act("reject", { note: "Rejected" }, "Payout rejected.")}>
              Reject
            </Button>
          </>
        )}
        {payout.status === "APPROVED" && (
          <>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="NEFT / UPI reference"
              className="max-w-56"
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() => act("mark-paid", { reference }, "Marked paid.")}
            >
              Mark paid
            </Button>
            <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => act("fail", { note: "Transfer failed" }, "Marked failed.")}>
              Mark failed
            </Button>
          </>
        )}
        {payout.status === "PAID" && (
          <Button variant="danger-outline" size="sm" disabled={busy} onClick={() => act("reverse", { note: "Clawback recorded" }, "Payout reversed.")}>
            Record reversal
          </Button>
        )}
      </div>
    </div>
  );
}
