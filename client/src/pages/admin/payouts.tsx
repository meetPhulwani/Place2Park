import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { api, consoleApi, errorMessage } from "@/services/console-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { formatDate, formatINR } from "@/lib/utils";
import { accountDigitsLabel, nextRevealedAccount, REVEAL_TTL_MS } from "@/lib/payout-reveal";

const STATUSES = ["ALL", "REQUESTED", "APPROVED", "PROCESSING", "PAID", "FAILED", "REJECTED", "REVERSED"];

interface AdminPayout {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reference?: string;
  requestedAt?: string;
  paidAt?: string;
  eligibleAmount?: number;
  hostId: { id: string; name?: string; email?: string };
  destination: {
    accountHolder: string;
    bankName: string;
    ifsc: string;
    accountLast4: string;
    verified: boolean;
    configured: boolean;
  };
}

interface Beneficiary {
  hostId: string;
  hostName: string;
  configured: boolean;
  verified: boolean;
  accountHolder: string;
  bankName: string;
  ifsc: string;
  accountLast4: string;
  eligibleAmount: number;
}

export default function AdminPayoutsPage() {
  const [params, setParams] = useSearchParams();
  const [payouts, setPayouts] = React.useState<AdminPayout[] | null>(null);
  const [beneficiaries, setBeneficiaries] = React.useState<Beneficiary[] | null>(null);
  const [listGeneration, setListGeneration] = React.useState(0);
  const status = STATUSES.includes(params.get("status") ?? "") && params.get("status") !== "ALL"
    ? params.get("status")!
    : undefined;

  const load = React.useCallback(() => {
    setListGeneration((n) => n + 1);
    api
      .get(`/payouts${status ? `?status=${status}` : ""}`)
      .then(({ data }) => {
        const rows = (data.data.payouts as AdminPayout[]).map((row) => ({
          ...row,
          destination: {
            accountHolder: row.destination?.accountHolder ?? "",
            bankName: row.destination?.bankName ?? "",
            ifsc: row.destination?.ifsc ?? "",
            accountLast4: row.destination?.accountLast4 ?? "",
            verified: Boolean(row.destination?.verified),
            configured: Boolean(row.destination?.configured),
          },
        }));
        setPayouts(rows);
      })
      .catch(() => setPayouts([]));
    api
      .get("/payout-beneficiaries")
      .then(({ data }) => setBeneficiaries(data.data.beneficiaries as Beneficiary[]))
      .catch(() => setBeneficiaries([]));
  }, [status]);

  React.useEffect(() => {
    document.title = "Payouts — Admin · Place2Park";
    load();
  }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0251B0]">Finance</p>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-[#111827]">Payouts</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manual settlements only. Recording a UTR does not send money. Transfer funds outside the
          platform, then mark the payout processing or paid.
        </p>
      </div>

      <section className="space-y-3" aria-label="Payout beneficiaries">
        <h2 className="text-sm font-semibold text-[#111827]">Host payout details</h2>
        {beneficiaries === null && <Skeleton className="h-24 rounded-2xl" />}
        {beneficiaries?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
            No host has configured payout details.
          </p>
        )}
        {beneficiaries && beneficiaries.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-line bg-white">
            <table className="min-w-[760px] w-full text-left text-sm">
              <thead className="bg-[#F3F5F7] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Host</th>
                  <th className="px-4 py-3 font-medium">Account</th>
                  <th className="px-4 py-3 font-medium">IFSC</th>
                  <th className="px-4 py-3 font-medium">Bank</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Eligible earnings</th>
                </tr>
              </thead>
              <tbody>
                {beneficiaries.map((row) => (
                  <tr key={row.hostId} className="border-t border-line">
                    <td className="px-4 py-3 font-medium text-[#111827]">{row.hostName}</td>
                    <td className="px-4 py-3">{row.accountHolder} · •••• {row.accountLast4}</td>
                    <td className="px-4 py-3">{row.ifsc}</td>
                    <td className="px-4 py-3">{row.bankName || "—"}</td>
                    <td className="px-4 py-3">{row.verified ? "Verified" : row.configured ? "Configured" : "Not configured"}</td>
                    <td className="px-4 py-3 text-right">{formatINR(row.eligibleAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <nav className="flex flex-wrap gap-1.5" aria-label="Filter by status">
        {STATUSES.map((s) => {
          const active = (status ?? "ALL") === s;
          return (
            <button
              key={s}
              onClick={() => setParams(s === "ALL" ? {} : { status: s }, { replace: true })}
              aria-current={active ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
                active
                  ? "bg-brand-500 text-white"
                  : "border border-line bg-white text-muted hover:bg-brand-50 hover:text-brand-700"
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
          <PayoutRow key={p.id} payout={p} listGeneration={listGeneration} onChanged={load} />
        ))}
      </div>
    </div>
  );
}

function PayoutRow({
  payout,
  listGeneration,
  onChanged,
}: {
  payout: AdminPayout;
  listGeneration: number;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [reference, setReference] = React.useState(payout.reference ?? "");
  const [transferDate, setTransferDate] = React.useState("");
  const [revealed, setRevealed] = React.useState<string | null>(null);

  React.useEffect(() => {
    setRevealed((current) => nextRevealedAccount(current, "refresh"));
  }, [listGeneration]);

  React.useEffect(() => {
    return () => {
      setRevealed((current) => nextRevealedAccount(current, "unmount"));
    };
  }, []);

  React.useEffect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        setRevealed((current) => nextRevealedAccount(current, "hidden"));
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  React.useEffect(() => {
    if (!revealed) return;
    const timer = window.setTimeout(() => {
      setRevealed((current) => nextRevealedAccount(current, "ttl"));
    }, REVEAL_TTL_MS);
    return () => window.clearTimeout(timer);
  }, [revealed]);

  async function act(path: string, body: Record<string, string>, msg: string) {
    setBusy(true);
    try {
      await consoleApi.post(`/payouts/${payout.id}/${path}`, body);
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  async function revealAccount() {
    setBusy(true);
    try {
      const { data } = await consoleApi.post(`/payouts/${payout.id}/reveal-destination`, {});
      setRevealed(nextRevealedAccount(null, "reveal", data.data.destination.accountNumber));
    } catch (e) {
      const status = (e as { response?: { status?: number } }).response?.status;
      toast.error(
        status === 403
          ? "You don't have access to reveal this account."
          : errorMessage(e, "Could not reveal the account number.")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass space-y-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[15px] font-semibold text-brand-600">
            {formatINR(payout.amount)} {payout.currency}
          </p>
          <p className="text-sm text-slate-500">
            {payout.hostId.name} ({payout.hostId.email}) · requested {payout.requestedAt ? formatDate(payout.requestedAt) : "—"}
          </p>
          <p className="text-xs text-slate-400">
            {payout.destination.accountHolder || "No account holder"} · {payout.destination.bankName || "Bank not set"} ·{" "}
            {payout.destination.ifsc || "No IFSC"} · {accountDigitsLabel(payout.destination.accountLast4, revealed)}
            {payout.destination.configured ? "" : " · payout details not configured"}
            {payout.destination.verified ? " · verified" : " · unverified"}
          </p>
          <p className="text-xs text-slate-400">
            Unclaimed eligible earnings {formatINR(payout.eligibleAmount ?? 0)}
            {payout.paidAt ? ` · transfer date ${formatDate(payout.paidAt)}` : ""}
            {payout.reference ? ` · UTR ${payout.reference}` : ""}
          </p>
        </div>
        <Badge variant={payout.status === "PAID" ? "success" : payout.status === "FAILED" || payout.status === "REJECTED" ? "danger" : "warning"}>
          {payout.status}
        </Badge>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {revealed ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() => setRevealed((current) => nextRevealedAccount(current, "hide"))}
          >
            Hide account
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={busy} onClick={revealAccount}>
            Reveal account
          </Button>
        )}
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
        {(payout.status === "REQUESTED" || payout.status === "APPROVED") && (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || !payout.destination.configured}
            onClick={() => act("processing", {}, "Marked processing. No money was sent.")}
          >
            Mark processing
          </Button>
        )}
        {(payout.status === "APPROVED" || payout.status === "PROCESSING") && (
          <>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="UTR / NEFT reference"
              className="max-w-56"
              autoComplete="off"
            />
            <Input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              aria-label="Transfer date"
              className="max-w-40"
            />
            <Button
              size="sm"
              disabled={busy || !payout.destination.configured}
              onClick={() => act("mark-paid", { reference, ...(transferDate ? { transferDate } : {}) }, "Marked paid.")}
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
