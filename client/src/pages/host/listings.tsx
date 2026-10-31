import * as React from "react";
import Link from "@/components/link";
import Image from "@/components/image";
import { BadgeCheck, Building2, Eye, MoreVertical, Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import type { ParkingSpaceFull } from "@/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceStatusBadge, Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Rating } from "@/components/ui/rating";
import { toast } from "@/components/ui/toaster";
import { getDisplayLocation } from "@/lib/location";
import { formatINR } from "@/lib/utils";

type Listing = ParkingSpaceFull & { upcomingBookings: number; availabilitySummary?: string };

export default function HostListingsPage() {
  const [listings, setListings] = React.useState<Listing[] | null>(null);

  const load = React.useCallback(() => {
    api.get("/host/listings").then(({ data }) => setListings(data.data.listings)).catch(() => setListings([]));
  }, []);

  React.useEffect(() => {
    document.title = "My listings · Place2Park";
    load();
  }, [load]);

  if (listings === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
    );
  }

  const groups: [string, Listing[]][] = [
    ["Active", listings.filter((l) => l.status === "VERIFIED" || l.status === "ACTIVE")],
    ["In review", listings.filter((l) => l.status === "PENDING_REVIEW")],
    ["Paused", listings.filter((l) => l.status === "PAUSED")],
    ["Drafts", listings.filter((l) => l.status === "DRAFT")],
    ["Rejected / hidden", listings.filter((l) => ["REJECTED", "HIDDEN"].includes(l.status))],
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            My listings
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {listings.length} space{listings.length === 1 ? "" : "s"} listed
          </p>
        </div>
        <Link href="/host/listings/new">
          <Button variant="accent">
            <Plus className="size-4" aria-hidden />
            New listing
          </Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No listings yet"
          description="Add your first parking space — it takes about five minutes."
          action={
            <Link href="/host/listings/new">
              <Button variant="accent">Create your first listing</Button>
            </Link>
          }
        />
      ) : (
        groups
          .filter(([, items]) => items.length > 0)
          .map(([label, items]) => (
            <section key={label} aria-label={label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-400">
                {label} ({items.length})
              </h2>
              <div className="space-y-3">
                {items.map((l) => (
                  <ListingCard key={l.id} listing={l} onChanged={load} />
                ))}
              </div>
            </section>
          ))
      )}
    </div>
  );
}

function ListingCard({ listing, onChanged }: { listing: Listing; onChanged: () => void }) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  async function act(action: "pause" | "activate" | "submit" | "delete") {
    setBusy(true);
    try {
      await api.patch(`/host/listings/${listing.id}/status`, { action });
      toast.success(
        action === "pause"
          ? "Listing paused — no new bookings will come in."
          : action === "submit"
            ? "Submitted for review."
            : action === "activate"
              ? "Listing is live again."
              : "Listing deleted."
      );
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
      setMenuOpen(false);
      setConfirmDelete(false);
    }
  }

  const imageUrl = listing.images[0]?.url ?? null;

  return (
    <div className="glass flex items-center gap-4 rounded-2xl p-4">
      <div className="relative hidden size-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block">
        {imageUrl && <Image src={imageUrl} alt="" fill sizes="80px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{listing.title}</h3>
          <SpaceStatusBadge status={listing.status} />
          {listing.verified && (
            <Badge variant="brand">
              <BadgeCheck className="size-3" aria-hidden />
              Verified
            </Badge>
          )}
        </div>
        {listing.status === "PENDING_REVIEW" && (
          <p className="mt-0.5 text-xs text-amber-800">
            Waiting for admin approval. It stays hidden from search until then.
          </p>
        )}
        <p className="mt-0.5 text-sm text-slate-500">
          {getDisplayLocation(listing)} ·{" "}
          <span className="font-medium text-brand-600">{formatINR(listing.pricePerHour)}/hr</span>
        </p>
        {listing.availabilitySummary && (
          <p className="mt-0.5 truncate text-xs text-slate-400">{listing.availabilitySummary}</p>
        )}
        <div className="mt-1 flex items-center gap-3 text-sm">
          <Rating value={listing.ratingAvg} count={listing.ratingCount} />
          <span className="text-xs text-slate-500">
            {listing.bookingsCount} booking{listing.bookingsCount === 1 ? "" : "s"}
          </span>
          {listing.upcomingBookings > 0 && (
            <span className="text-xs font-medium text-brand-700">
              {listing.upcomingBookings} upcoming
            </span>
          )}
        </div>
      </div>
      <div ref={menuRef} className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={`Actions for ${listing.title}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          disabled={busy}
          className="rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          <MoreVertical className="size-5" aria-hidden />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="glass-strong absolute right-0 z-20 mt-1 w-48 rounded-xl p-1.5 animate-scale-in"
          >
            <MenuLink href={`/parking/${listing.id}`} icon={Eye} label="Preview" />
            <MenuLink href={`/host/listings/${listing.id}/edit`} icon={Pencil} label="Edit" />
            {["ACTIVE", "VERIFIED"].includes(listing.status) && (
              <MenuButton icon={Pause} label="Pause listing" onClick={() => act("pause")} />
            )}
            {listing.status === "PAUSED" && (
              <MenuButton icon={Play} label="Resume listing" onClick={() => act("activate")} />
            )}
            {["DRAFT", "REJECTED"].includes(listing.status) && (
              <MenuButton icon={Play} label="Submit for review" onClick={() => act("submit")} />
            )}
            <MenuButton
              icon={Trash2}
              label="Delete"
              destructive
              onClick={() => {
                setMenuOpen(false);
                setConfirmDelete(true);
              }}
            />
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => act("delete")}
        loading={busy}
        danger
        title="Delete this listing?"
        description="This permanently removes the listing, its photos and its availability. Past bookings are kept for records."
        confirmLabel="Delete listing"
      />
    </div>
  );
}

function MenuLink({ href, icon: Icon, label }: { href: string; icon: typeof Eye; label: string }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-100"
    >
      <Icon className="size-4 text-slate-400" aria-hidden />
      {label}
    </Link>
  );
}

function MenuButton({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof Eye;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
        destructive ? "text-red-600 hover:bg-red-50" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      <Icon className={`size-4 ${destructive ? "text-red-400" : "text-slate-400"}`} aria-hidden />
      {label}
    </button>
  );
}
