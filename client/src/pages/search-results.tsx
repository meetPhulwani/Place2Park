import * as React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, SearchX } from "lucide-react";
import type { SpaceSummary } from "@/types";
import { Navbar } from "@/components/navbar";
import { ParkingCard } from "@/components/parking-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ParkingCardSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import type { Filters } from "@/components/filter-panel";
import { filterSummary, formatSearchDateLabel, formatSearchTimeLabel, RESULTS_PAGE_SIZE } from "@/lib/search-summary";
import { useParkingSearch, type SearchLocationState } from "@/lib/use-parking-search";

function readQuery(params: URLSearchParams) {
  return {
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
}

export default function SearchResultsPage() {
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const paramString = params.toString();
  const handoff = location.state as SearchLocationState | null;
  const seedKey = handoff?.searchKey === paramString ? handoff.searchKey : null;
  const seedResults = seedKey ? handoff?.results ?? null : null;
  const { spaces, apiDestination, pending } = useParkingSearch(paramString, seedKey, seedResults);
  const [visible, setVisible] = React.useState(RESULTS_PAGE_SIZE);

  const query = readQuery(params);
  const destinationName = params.get("q") || apiDestination?.name || "";

  React.useEffect(() => {
    document.title = destinationName ? `Parking near ${destinationName} · Place2Park` : "Parking · Place2Park";
  }, [destinationName]);

  React.useEffect(() => {
    setVisible(RESULTS_PAGE_SIZE);
  }, [paramString]);

  const results = spaces ?? [];
  const shown = results.slice(0, visible);
  const chips = filterSummary(query);
  const dateLabel = formatSearchDateLabel(query.start);
  const timeLabel = formatSearchTimeLabel(query.start, query.durationMins);
  const bookingParams = new URLSearchParams();
  if (query.start) bookingParams.set("start", query.start);
  if (query.durationMins) bookingParams.set("durationMins", String(query.durationMins));
  const bookingQS = bookingParams.toString();
  const mapHref = `/search${paramString ? `?${paramString}` : ""}`;

  function backToMap(edit: boolean) {
    const state: SearchLocationState = {};
    if (edit) state.editSearch = true;
    if (spaces) {
      state.results = spaces;
      state.searchKey = paramString;
    }
    navigate(mapHref, { state });
  }

  return (
    <div className="min-h-dvh bg-page">
      <Navbar />
      <div className="sticky top-14 z-30 border-b border-line bg-white sm:top-16">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => backToMap(false)}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-brand-500 hover:bg-brand-50"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Map
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" title={destinationName || undefined}>
            {destinationName || "Parking spaces"}
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => backToMap(true)}>
            Edit
          </Button>
        </div>
        {dateLabel || timeLabel || chips ? (
          <div className="mx-auto max-w-3xl space-y-1 px-4 pb-3 sm:px-6">
            {dateLabel ? (
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                <Calendar className="size-3.5 shrink-0 text-brand-500" aria-hidden />
                <span className="truncate">{dateLabel}</span>
              </p>
            ) : null}
            {timeLabel ? (
              <p className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
                <Clock className="size-3.5 shrink-0 text-brand-500" aria-hidden />
                <span className="truncate">{timeLabel}</span>
              </p>
            ) : null}
            {chips ? (
              <p className="truncate text-xs text-slate-500" title={chips}>
                {chips}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <main className="mx-auto w-full max-w-3xl px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6">
        <p className="mb-3 text-sm text-slate-500" aria-live="polite">
          {pending || spaces === null
            ? "Updating…"
            : `${results.length} space${results.length === 1 ? "" : "s"}`}
          {destinationName ? ` near ${destinationName}` : ""}
        </p>

        {spaces === null ? (
          <div className="grid gap-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <ParkingCardSkeleton key={i} />
            ))}
          </div>
        ) : results.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title={
              destinationName ? "No parking spaces available near this location yet." : "No parking found here"
            }
            description={
              destinationName
                ? "Try another area or a different time."
                : "Try widening the distance filter, changing the time window, or searching a nearby area."
            }
            action={
              <Button variant="secondary" onClick={() => backToMap(true)}>
                Edit search
              </Button>
            }
          />
        ) : (
          <>
            <ul className="grid gap-2.5" role="list">
              {shown.map((s: SpaceSummary) => (
                <li key={s.id}>
                  <ParkingCard space={s} bookingParams={bookingQS} />
                </li>
              ))}
            </ul>
            {visible < results.length && (
              <div className="mt-4 flex justify-center">
                <Button variant="secondary" onClick={() => setVisible((n) => n + RESULTS_PAGE_SIZE)}>
                  Show more
                </Button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
