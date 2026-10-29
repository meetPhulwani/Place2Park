import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { List, Map as MapIcon, SearchX, SlidersHorizontal, X } from "lucide-react";
import { api } from "@/services/api";
import type { SpaceSummary } from "@/types";
import { Navbar } from "@/components/navbar";
import { MapView } from "@/components/map/map-view";
import { ParkingCard } from "@/components/parking-card";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilterPanel, type Filters } from "@/components/filter-panel";
import { formatINR, toDateInputValue, toTimeInputValue, cn } from "@/lib/utils";

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const [spaces, setSpaces] = React.useState<SpaceSummary[] | null>(null);
  const [destination, setDestination] = React.useState<{ lat: number; lng: number; name?: string } | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const listRef = React.useRef<HTMLDivElement>(null);

  const query = {
    q: params.get("q") ?? undefined,
    start: params.get("start") ?? undefined,
    durationMins: params.get("durationMins") ? Number(params.get("durationMins")) : undefined,
    maxPrice: params.get("maxPrice") ? Number(params.get("maxPrice")) : undefined,
    maxDistanceKm: params.get("maxDistanceKm") ? Number(params.get("maxDistanceKm")) : undefined,
    covered: params.get("covered") === "true" || undefined,
    ev: params.get("ev") === "true" || undefined,
    vehicleType: (params.get("vehicleType") as "CAR" | "BIKE" | null) ?? undefined,
    minRating: params.get("minRating") ? Number(params.get("minRating")) : undefined,
    sort: (params.get("sort") as Filters["sort"]) ?? "closest",
  };

  React.useEffect(() => {
    document.title = "Find parking · Parkly";
  }, []);

  const paramString = params.toString();
  React.useEffect(() => {
    let cancelled = false;
    setPending(true);
    const qs = new URLSearchParams(paramString);
    if (qs.get("start") && !qs.get("durationMins")) qs.set("durationMins", "120");
    api
      .get(`/parking/search?${qs.toString()}`)
      .then(({ data }) => {
        if (cancelled) return;
        setSpaces(data.data.results);
        const center = data.data.center as { lat: number; lng: number } | null;
        setDestination(center ? { ...center, name: data.data.resolvedArea ?? qs.get("q") ?? undefined } : null);
      })
      .catch(() => !cancelled && setSpaces([]))
      .finally(() => !cancelled && setPending(false));
    return () => {
      cancelled = true;
    };
  }, [paramString]);

  function applyFilters(f: Filters) {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    const lat = params.get("lat");
    const lng = params.get("lng");
    if (lat) next.set("lat", lat);
    if (lng) next.set("lng", lng);
    if (query.start) next.set("start", query.start);
    if (query.durationMins) next.set("durationMins", String(query.durationMins));
    if (f.maxPrice) next.set("maxPrice", String(f.maxPrice));
    if (f.maxDistanceKm) next.set("maxDistanceKm", String(f.maxDistanceKm));
    if (f.covered) next.set("covered", "true");
    if (f.ev) next.set("ev", "true");
    if (f.vehicleType) next.set("vehicleType", f.vehicleType);
    if (f.minRating) next.set("minRating", String(f.minRating));
    if (f.sort && f.sort !== "closest") next.set("sort", f.sort);
    setParams(next, { replace: true });
  }

  function onMarkerSelect(id: string) {
    setSelectedId(id);
    listRef.current
      ?.querySelector(`[data-space-id="${id}"]`)
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const start = query.start ? new Date(query.start) : null;
  const bookingParams = new URLSearchParams();
  if (query.start) bookingParams.set("start", query.start);
  if (query.durationMins) bookingParams.set("durationMins", String(query.durationMins));
  const bookingQS = bookingParams.toString();

  const results = spaces ?? [];
  const markers = results.map((s) => ({
    id: s.id,
    lat: s.latitude,
    lng: s.longitude,
    label: formatINR(s.pricePerHour),
    title: s.title,
  }));

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <div className="relative min-h-0 flex-1">
        <div className={cn("absolute inset-0", mobileView === "list" && "hidden lg:block")}>
          <MapView
            markers={markers}
            destination={destination}
            selectedId={selectedId}
            onSelect={onMarkerSelect}
            className="h-full w-full"
          />
        </div>

        <div
          className={cn(
            "relative z-10 flex h-full w-full flex-col p-3 sm:p-4 lg:absolute lg:inset-y-3 lg:left-3 lg:w-[400px] lg:p-0 xl:w-[440px]",
            mobileView === "map" && "hidden lg:flex"
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-card">
            <div className="relative z-20 space-y-3 overflow-visible border-b border-line p-3 sm:p-4">
              <SearchBar
                compact
                defaults={{
                  q: query.q,
                  date: start ? toDateInputValue(start) : undefined,
                  time: start ? toTimeInputValue(start) : undefined,
                  durationMins: query.durationMins,
                }}
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-500" aria-live="polite">
                  {pending || spaces === null
                    ? "Updating…"
                    : `${results.length} space${results.length === 1 ? "" : "s"} found`}
                  {destination?.name ? ` near ${destination.name}` : ""}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFiltersOpen((v) => !v)}
                  aria-expanded={filtersOpen}
                >
                  {filtersOpen ? <X className="size-4" aria-hidden /> : <SlidersHorizontal className="size-4" aria-hidden />}
                  Filters
                </Button>
              </div>
              {filtersOpen && <FilterPanel value={query} onChange={applyFilters} busy={pending} />}
            </div>
            <div
              ref={listRef}
              className={cn("scrollbar-thin flex-1 overflow-y-auto p-3 sm:p-4", pending && "opacity-60")}
            >
              {spaces === null ? (
                <div className="grid gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-64 rounded-2xl" />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title="No parking found here"
                  description="Try widening the distance filter, changing the time window, or searching a nearby area."
                  action={
                    <Button variant="secondary" onClick={() => applyFilters({ sort: "closest" })}>
                      Clear all filters
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-3" role="list">
                  {results.map((s) => (
                    <li key={s.id}>
                      <ParkingCard
                        space={s}
                        selected={s.id === selectedId}
                        onHover={setSelectedId}
                        bookingParams={bookingQS}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 lg:hidden">
          <button
            onClick={() => setMobileView((v) => (v === "list" ? "map" : "list"))}
            className="flex items-center gap-2 rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white shadow-pop"
          >
            {mobileView === "list" ? (
              <>
                <MapIcon className="size-4" aria-hidden /> Show map
              </>
            ) : (
              <>
                <List className="size-4" aria-hidden /> Show list
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
