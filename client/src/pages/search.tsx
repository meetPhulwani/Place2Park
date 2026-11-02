import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { List, Map as MapIcon, SearchX, SlidersHorizontal, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { MapView } from "@/components/map/map-view";
import { ParkingCard } from "@/components/parking-card";
import { SearchBar } from "@/components/search-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ParkingCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FilterPanel, type Filters } from "@/components/filter-panel";
import { formatINR, toDateInputValue, toTimeInputValue, cn } from "@/lib/utils";
import { occlusionFromRects, straightLineLabel } from "@/lib/destination";
import { haversineKm } from "@/lib/geo";
import { spaceCoordinates } from "@/lib/space-coords";
import { filterSummary, finiteCoord, hasDestinationCoords, MOBILE_PREVIEW_COUNT } from "@/lib/search-summary";
import { useParkingSearch, type SearchLocationState } from "@/lib/use-parking-search";

function useNarrowScreen() {
  const [narrow, setNarrow] = React.useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches
  );
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return narrow;
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paramString = params.toString();
  const handoff = location.state as SearchLocationState | null;
  const seedKey = handoff?.results && handoff.searchKey === paramString ? handoff.searchKey : null;
  const { spaces, apiDestination, pending } = useParkingSearch(paramString, seedKey, seedKey ? handoff?.results : null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [mobileView, setMobileView] = React.useState<"list" | "map">("list");
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const editRequested = Boolean((location.state as SearchLocationState | null)?.editSearch);
  const destinationKey = `${params.get("q") ?? ""}|${params.get("lat") ?? ""}|${params.get("lng") ?? ""}`;
  const [editing, setEditing] = React.useState(editRequested);
  const narrow = useNarrowScreen();
  const [occlusion, setOcclusion] = React.useState({ left: 0, top: 0, right: 0, bottom: 0 });
  const listRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const sheetRef = React.useRef<HTMLDivElement>(null);

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
    document.title = "Find parking · Place2Park";
  }, []);

  React.useEffect(() => {
    setEditing(editRequested);
  }, [destinationKey, editRequested]);

  React.useEffect(() => {
    const stage = stageRef.current;
    const sheet = sheetRef.current;
    if (!stage) return;
    const measure = () => {
      const map = stage.getBoundingClientRect();
      const hidden = !sheet || getComputedStyle(sheet).display === "none";
      const next = occlusionFromRects(map, hidden ? null : sheet.getBoundingClientRect());
      setOcclusion((current) =>
        current.left === next.left &&
        current.top === next.top &&
        current.right === next.right &&
        current.bottom === next.bottom
          ? current
          : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    if (sheet) observer.observe(sheet);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [mobileView]);

  function applyFilters(f: Filters) {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    const lat = params.get("lat");
    const lng = params.get("lng");
    if (lat) next.set("lat", lat);
    if (lng) next.set("lng", lng);
    const radius = params.get("radius");
    if (radius && !f.maxDistanceKm) next.set("radius", radius);
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

  const urlLat = finiteCoord(params.get("lat"));
  const urlLng = finiteCoord(params.get("lng"));
  const urlDestination =
    urlLat != null && urlLng != null ? { lat: urlLat, lng: urlLng, name: params.get("q") ?? undefined } : null;
  const destination = urlDestination
    ? { ...urlDestination, name: urlDestination.name || apiDestination?.name }
    : apiDestination;

  const hasDestination = hasDestinationCoords(urlLat, urlLng);
  const mobileExpanded = !hasDestination || editing;
  const chips = filterSummary(query);
  const destinationLabel = destination?.name || query.q || "Selected destination";
  const results = spaces ?? [];
  const listed = narrow && hasDestination ? results.slice(0, MOBILE_PREVIEW_COUNT) : results;

  function openAllResults() {
    navigate(`/search/results?${paramString}`, {
      state: spaces ? ({ results: spaces, searchKey: paramString } satisfies SearchLocationState) : undefined,
    });
  }
  const markers = results.flatMap((s) => {
    const coords = spaceCoordinates(s);
    if (!coords) return [];
    const km =
      s.distanceKm != null && Number.isFinite(s.distanceKm)
        ? s.distanceKm
        : destination
          ? haversineKm(destination.lat, destination.lng, coords.lat, coords.lng)
          : null;
    return [
      {
        id: s.id,
        lat: coords.lat,
        lng: coords.lng,
        label: formatINR(s.pricePerHour),
        title: s.title,
        detail: straightLineLabel(km) ?? undefined,
        href: `/parking/${s.id}${bookingQS ? `?${bookingQS}` : ""}`,
      },
    ];
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar />
      <div ref={stageRef} className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <MapView
            markers={markers}
            destination={destination}
            occlusion={occlusion}
            selectedId={selectedId}
            onSelect={onMarkerSelect}
            onOpen={(href) => navigate(href)}
            className="h-full w-full"
          />
        </div>

        <div
          ref={sheetRef}
          className={cn(
            "absolute inset-x-0 top-[38%] bottom-0 z-10 flex min-h-0 flex-col overflow-hidden p-3 sm:p-4",
            "lg:inset-y-3 lg:left-3 lg:right-auto lg:w-[400px] lg:p-0 xl:w-[440px]",
            mobileView === "map" && "max-lg:hidden"
          )}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-white shadow-card">
            <div className="relative z-20 shrink-0 space-y-3 overflow-visible border-b border-line p-3 sm:p-4">
              <div className={cn(!mobileExpanded && "max-lg:hidden")}>
                <SearchBar
                  compact
                  onSearched={() => setEditing(false)}
                  defaults={{
                    q: query.q,
                    date: start ? toDateInputValue(start) : undefined,
                    time: start ? toTimeInputValue(start) : undefined,
                    durationMins: query.durationMins,
                  }}
                />
              </div>
              {hasDestination && (
                <div className={cn("lg:hidden", mobileExpanded && "hidden")}>
                  <div className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={destinationLabel}>
                      {destinationLabel}
                    </p>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
                      Edit
                    </Button>
                  </div>
                  {chips ? (
                    <p className="mt-1 truncate text-xs text-slate-500" title={chips}>
                      {chips}
                    </p>
                  ) : null}
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <p className="line-clamp-2 text-sm text-slate-500 lg:line-clamp-none" aria-live="polite">
                  {pending || spaces === null
                    ? "Updating…"
                    : `${results.length} space${results.length === 1 ? "" : "s"} found`}
                  {destination?.name ? ` near ${destination.name}` : ""}
                  {destination ? ". Distances are straight-line." : ""}
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
              {hasDestination && !mobileExpanded && (
                <div className="space-y-1 lg:hidden">
                  <Button type="button" className="h-11 w-full" onClick={openAllResults}>
                    Show all parking spaces
                  </Button>
                  <p className="truncate text-center text-xs text-slate-500" title={destinationLabel}>
                    Explore all available parking spaces near {destinationLabel}
                  </p>
                </div>
              )}
            </div>
            <div
              ref={listRef}
              className={cn(
                "scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 max-lg:pb-24",
                pending && "opacity-60"
              )}
            >
              {spaces === null ? (
                <div className="grid gap-2.5">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <ParkingCardSkeleton key={i} />
                  ))}
                </div>
              ) : results.length === 0 ? (
                <EmptyState
                  icon={SearchX}
                  title={destination ? "No parking near this destination" : "No parking found here"}
                  description={
                    destination
                      ? `The map stays centred on ${destination.name ?? "this place"}. Try widening the distance filter or searching a nearby area.`
                      : "Try widening the distance filter, changing the time window, or searching a nearby area."
                  }
                  action={
                    <Button variant="secondary" onClick={() => applyFilters({ sort: "closest" })}>
                      Clear all filters
                    </Button>
                  }
                />
              ) : (
                <ul className="grid gap-2.5" role="list">
                  {listed.map((s) => (
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
            className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-pop transition-colors duration-200 hover:bg-brand-600"
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
