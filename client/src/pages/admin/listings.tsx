import * as React from "react";
import Link from "@/components/link";
import { useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { SpaceStatusBadge, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toaster";
import { formatINR, formatDate } from "@/lib/utils";

const STATUSES = ["ALL", "PENDING_REVIEW", "ACTIVE", "PAUSED", "REJECTED", "HIDDEN", "DRAFT"];

interface AdminListing {
  id: string;
  title: string;
  area: string;
  city: string;
  status: string;
  pricePerHour: number;
  updatedAt: string;
  hostId: { name?: string; email?: string } | null;
  openReports: number;
}

export default function AdminListingsPage() {
  const [params, setParams] = useSearchParams();
  const [listings, setListings] = React.useState<AdminListing[] | null>(null);

  const status = STATUSES.includes(params.get("status") ?? "") && params.get("status") !== "ALL"
    ? params.get("status")!
    : undefined;

  const load = React.useCallback(() => {
    api
      .get(`/admin/listings${status ? `?status=${status}` : ""}`)
      .then(({ data }) => setListings(data.data.listings))
      .catch(() => setListings([]));
  }, [status]);

  React.useEffect(() => {
    document.title = "Listings — Admin · Parkly";
    load();
  }, [load]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Listings</h1>
        <p className="mt-1 text-sm text-slate-500">Approve, reject or hide parking listings.</p>
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
              {s === "ALL" ? "All" : s.replace("_", " ").toLowerCase()}
            </button>
          );
        })}
      </nav>

      <div className="space-y-3">
        {listings === null && <Skeleton className="h-40 rounded-2xl" />}
        {listings?.length === 0 && (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No listings with this status.
          </p>
        )}
        {listings?.map((l) => (
          <div
            key={l.id}
            className="glass flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"
          >
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/parking/${l.id}`}
                  className="truncate text-[15px] font-semibold text-slate-900 hover:text-brand-800"
                >
                  {l.title}
                </Link>
                <SpaceStatusBadge status={l.status} />
                {l.openReports > 0 && (
                  <Badge variant="danger">{l.openReports} open report{l.openReports > 1 ? "s" : ""}</Badge>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500">
                {l.area}, {l.city} · {formatINR(l.pricePerHour)}/hr
              </p>
              <p className="text-xs text-slate-400">
                Host: {l.hostId?.name} ({l.hostId?.email}) · Updated {formatDate(l.updatedAt)}
              </p>
            </div>
            <ListingModeration spaceId={l.id} status={l.status} onChanged={load} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ListingModeration({
  spaceId,
  status,
  onChanged,
}: {
  spaceId: string;
  status: string;
  onChanged: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function act(action: "approve" | "reject" | "hide" | "unhide", msg: string) {
    setBusy(true);
    try {
      await api.post(`/admin/listings/${spaceId}/moderate`, { action });
      toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, "Action failed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === "PENDING_REVIEW" && (
        <>
          <Button size="sm" disabled={busy} onClick={() => act("approve", "Listing approved and live.")}>
            Approve
          </Button>
          <Button
            variant="danger-outline"
            size="sm"
            disabled={busy}
            onClick={() => act("reject", "Listing rejected.")}
          >
            Reject
          </Button>
        </>
      )}
      {(status === "ACTIVE" || status === "VERIFIED") && (
        <Button
          variant="danger-outline"
          size="sm"
          disabled={busy}
          onClick={() => act("hide", "Listing hidden from search.")}
        >
          Hide
        </Button>
      )}
      {status === "HIDDEN" && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={() => act("unhide", "Listing restored.")}
        >
          Unhide
        </Button>
      )}
      {status === "REJECTED" && (
        <Button size="sm" disabled={busy} onClick={() => act("approve", "Listing approved and live.")}>
          Approve
        </Button>
      )}
    </div>
  );
}
