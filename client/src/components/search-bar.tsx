import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { MapPin, Search } from "lucide-react";
import { ALLOWED_DURATIONS_MINS } from "@/lib/constants";
import { formatDuration, nextHalfHour, toDateInputValue, toTimeInputValue, cn } from "@/lib/utils";
import { selectedPlaceLabel } from "@/lib/search-summary";
import { rememberPlace } from "@/lib/recent-places";
import { resolveDestinationQuery } from "@/lib/destination";
import { PlacesAutocomplete } from "@/components/map/places-autocomplete";
import { Button } from "./ui/button";

const FILTER_KEYS = ["maxPrice", "maxDistanceKm", "covered", "ev", "vehicleType", "minRating", "sort"] as const;

export type SearchPlaceInput = {
  q: string;
  label?: string;
  lat?: number;
  lng?: number;
  placeId?: string;
};

export type SearchBarHandle = {
  searchPlace: (place: SearchPlaceInput) => void;
};

export const SearchBar = React.forwardRef<
  SearchBarHandle,
  {
    compact?: boolean;
    variant?: "default" | "dock";
    defaults?: { q?: string; date?: string; time?: string; durationMins?: number };
    onSearched?: () => void;
  }
>(function SearchBar({ compact, variant = "default", defaults, onSearched }, ref) {
  const dock = variant === "dock";
  const navigate = useNavigate();
  const [currentParams] = useSearchParams();
  const start = nextHalfHour();
  const [q, setQ] = React.useState(defaults?.q ?? "");
  const [date, setDate] = React.useState(defaults?.date ?? toDateInputValue(start));
  const [time, setTime] = React.useState(defaults?.time ?? toTimeInputValue(start));
  const [duration, setDuration] = React.useState(defaults?.durationMins ?? 120);
  const [resolving, setResolving] = React.useState(false);
  const selected = React.useRef<{ lat: number; lng: number; label: string; placeId?: string } | null>(null);

  React.useEffect(() => {
    setQ(defaults?.q ?? "");
  }, [defaults?.q]);

  function updateQuery(value: string) {
    selected.current = null;
    setQ(value);
  }

  async function submit(e?: React.FormEvent, coords?: { lat: number; lng: number } | null, queryOverride?: string) {
    e?.preventDefault();
    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const v = currentParams.get(key);
      if (v) params.set(key, v);
    }
    let query = (queryOverride ?? q).trim();
    let fromPlace = coords ?? selected.current;
    if (query && !fromPlace) {
      setResolving(true);
      try {
        const resolved = await resolveDestinationQuery(query);
        if (resolved) {
          fromPlace = { lat: resolved.latitude, lng: resolved.longitude };
          query = resolved.label || query;
          setQ(query);
          selected.current = { ...fromPlace, label: query, placeId: resolved.placeId };
        }
      } finally {
        setResolving(false);
      }
    }
    if (!fromPlace && query && query === (currentParams.get("q") ?? "").trim()) {
      const lat = Number(currentParams.get("lat"));
      const lng = Number(currentParams.get("lng"));
      if (Number.isFinite(lat) && Number.isFinite(lng)) fromPlace = { lat, lng };
    }
    if (query) params.set("q", query);
    if (fromPlace) {
      params.set("lat", String(fromPlace.lat));
      params.set("lng", String(fromPlace.lng));
      params.set("radius", "12");
      const placeId = selected.current?.placeId;
      if (placeId) params.set("placeId", placeId);
    }
    if (date && time) params.set("start", new Date(`${date}T${time}`).toISOString());
    params.set("durationMins", String(duration));
    if (query) {
      rememberPlace({
        label: selected.current?.label || query,
        q: query,
        lat: fromPlace?.lat,
        lng: fromPlace?.lng,
        placeId: selected.current?.placeId,
      });
    }
    if (fromPlace) onSearched?.();
    navigate(`/search?${params.toString()}`);
  }

  const submitRef = React.useRef(submit);
  submitRef.current = submit;

  React.useImperativeHandle(ref, () => ({
    searchPlace(place) {
      const query = (place.label || place.q).trim();
      if (!query) return;
      setQ(query);
      const lat = place.lat;
      const lng = place.lng;
      const coords =
        lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      selected.current = coords ? { ...coords, label: query, placeId: place.placeId } : null;
      void submitRef.current(undefined, coords, query);
    },
  }));

  return (
    <form
      onSubmit={(e) => submit(e)}
      role="search"
      aria-label="Search parking"
      className={cn(
        "w-full overflow-visible",
        dock
          ? "grid gap-2"
          : cn(
              "rounded-xl border border-line bg-white p-2 shadow-card",
              compact ? "flex flex-col gap-2" : "grid gap-2 sm:grid-cols-[1.6fr_1fr_0.8fr_1fr_auto]"
            )
      )}
    >
      <div className="relative z-[80] min-w-0 flex-1 overflow-visible">
        <label htmlFor="search-destination" className="sr-only">
          Destination
        </label>
        <div className="flex items-center gap-2 rounded-lg bg-page px-3 transition-shadow duration-200 focus-within:ring-2 focus-within:ring-brand-500/30">
          <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
          <PlacesAutocomplete
            id="search-destination"
            value={q}
            onChange={updateQuery}
            hideDeniedHint
            placeholder={dock ? "Where to?" : "City, locality, street, or landmark"}
            className="h-11 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
            onPlace={(p) => {
              const label = selectedPlaceLabel(p);
              selected.current = { lat: p.latitude, lng: p.longitude, label, placeId: p.placeId || undefined };
              setQ(label);
              submit(undefined, { lat: p.latitude, lng: p.longitude }, label);
            }}
          />
        </div>
      </div>
      <div className={dock ? "grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]" : "contents"}>
      <div>
        <label htmlFor="search-date" className="sr-only">
          Date
        </label>
        <input
          id="search-date"
          type="date"
          value={date}
          min={toDateInputValue(new Date())}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 w-full rounded-lg bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>
      <div>
        <label htmlFor="search-time" className="sr-only">
          Start time
        </label>
        <input
          id="search-time"
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="h-11 w-full rounded-lg bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        />
      </div>
      <div>
        <label htmlFor="search-duration" className="sr-only">
          Duration
        </label>
        <select
          id="search-duration"
          value={duration}
          onChange={(e) => setDuration(Number(e.target.value))}
          className="h-11 w-full appearance-none rounded-lg bg-page px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-500/30"
        >
          {ALLOWED_DURATIONS_MINS.map((m) => (
            <option key={m} value={m}>
              {formatDuration(m)}
            </option>
          ))}
        </select>
      </div>
      <Button
        type="submit"
        size="lg"
        disabled={resolving}
        className={cn("h-11 min-w-[7.5rem] shadow-sm sm:px-6", dock && "col-span-2 sm:col-span-1")}
      >
        <Search className="size-4" aria-hidden />
        <span className={compact && !dock ? "sm:hidden lg:inline" : ""}>Search</span>
      </Button>
      </div>
    </form>
  );
});
