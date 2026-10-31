import * as React from "react";
import { MapPin, SearchX } from "lucide-react";
import { api } from "@/services/api";
import type { SpaceSummary } from "@/types";
import { MapView } from "@/components/map/map-view";
import { ParkingCard } from "@/components/parking-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "@/components/link";
import { formatINR } from "@/lib/utils";

const PREVIEW_COUNT = 4;

export function NearbyParking({
  hint,
}: {
  hint?: { lat: number; lng: number } | null;
}) {
  const [origin, setOrigin] = React.useState<{ lat: number; lng: number } | null>(hint ?? null);
  const [spaces, setSpaces] = React.useState<SpaceSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    if (origin) {
      qs.set("lat", String(origin.lat));
      qs.set("lng", String(origin.lng));
      qs.set("radius", "12");
      qs.set("sort", "closest");
    } else {
      qs.set("sort", "rating");
    }
    setFailed(false);
    api
      .get(`/parking/search?${qs.toString()}`)
      .then(({ data }) => {
        if (cancelled) return;
        const results = (data.data.results as SpaceSummary[]) ?? [];
        setSpaces(results.slice(0, PREVIEW_COUNT));
      })
      .catch(() => {
        if (!cancelled) {
          setSpaces([]);
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  const preview = spaces ?? [];
  const markers = preview.map((s) => ({
    id: s.id,
    lat: s.latitude,
    lng: s.longitude,
    label: formatINR(s.pricePerHour),
    title: s.title,
  }));
  const searchHref = origin
    ? `/search?lat=${origin.lat}&lng=${origin.lng}&radius=12`
    : "/search";

  if (spaces === null) {
    return (
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Skeleton className="h-64 rounded-xl lg:h-80" />
        <div className="grid gap-3">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        icon={SearchX}
        title="Couldn't load nearby parking"
        description="The map will show listings once search is available again."
        action={
          <Link href="/search">
            <Button variant="secondary">Open search</Button>
          </Link>
        }
      />
    );
  }

  if (preview.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No listings to preview"
        description="Search a destination to see verified spaces on the map."
        action={
          <Link href="/search">
            <Button variant="accent">Find parking</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <MapView
          markers={markers}
          center={origin ?? undefined}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-64 w-full lg:h-80"
        />
      </div>
      <div className="grid gap-3">
        {preview.slice(0, 2).map((s) => (
          <ParkingCard
            key={s.id}
            space={s}
            selected={s.id === selectedId}
            onHover={setSelectedId}
          />
        ))}
        <Link
          href={searchHref}
          className="inline-flex items-center justify-center rounded-lg border border-brand-500 bg-white px-3 py-2 text-sm font-medium text-brand-600 transition-colors duration-200 hover:bg-brand-50"
        >
          View {preview.length === PREVIEW_COUNT ? "all nearby" : "more"} spaces
        </Link>
      </div>
    </div>
  );
}
