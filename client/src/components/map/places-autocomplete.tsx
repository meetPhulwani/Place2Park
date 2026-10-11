import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, MapPin, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/services/api";
import {
  googleMapsApiKey,
  loadGoogleMaps,
  resolvedLocationFromComponents,
  type ResolvedLocation,
} from "@/lib/google-maps";
import { catalogSuggestions, resolvedFromCatalog } from "@/lib/place-catalog";
import { cn } from "@/lib/utils";

export type PlaceSelection = ResolvedLocation;

type Suggestion = {
  id: string;
  mainText: string;
  secondaryText: string;
  source: "google" | "local";
  placeId?: string;
  lat?: number;
  lng?: number;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

function fromPlace(place: google.maps.places.PlaceResult): PlaceSelection | null {
  const loc = place.geometry?.location;
  if (!loc) return null;
  return resolvedLocationFromComponents({
    formattedAddress: place.formatted_address,
    name: place.name,
    placeId: place.place_id,
    addressComponents: place.address_components,
    latitude: loc.lat(),
    longitude: loc.lng(),
  });
}

function mergeSuggestions(google: Suggestion[], local: Suggestion[]) {
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const item of [...google, ...local]) {
    const key = item.mainText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.slice(0, 8);
}

export function PlacesAutocomplete({
  value,
  onChange,
  onPlace,
  placeholder,
  id,
  className,
  hideDeniedHint,
}: {
  value: string;
  onChange: (value: string) => void;
  onPlace: (place: PlaceSelection) => void;
  placeholder?: string;
  id?: string;
  className?: string;
  hideDeniedHint?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const onPlaceRef = React.useRef(onPlace);
  onPlaceRef.current = onPlace;
  const [ready, setReady] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [active, setActive] = React.useState(0);
  const [denied, setDenied] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const apiKey = googleMapsApiKey();
  const session = React.useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const seq = React.useRef(0);
  const listId = `${id ?? "place"}-listbox`;

  const placeMenu = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 260) });
  }, []);

  React.useEffect(() => {
    if (!apiKey) return;
    let cancelled = false;
    loadGoogleMaps(apiKey).then(() => {
      if (!cancelled && window.google?.maps?.places) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      seq.current += 1;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    const requestId = ++seq.current;
    setLoading(true);
    setOpen(true);
    placeMenu();

    const handle = window.setTimeout(async () => {
      const local = catalogSuggestions(q);
      let googleItems: Suggestion[] = [];
      let googleDenied = false;

      if (ready && window.google?.maps?.places) {
        if (!session.current) session.current = new google.maps.places.AutocompleteSessionToken();
        googleItems = await new Promise((resolve) => {
          const svc = new google.maps.places.AutocompleteService();
          svc.getPlacePredictions(
            {
              input: q,
              componentRestrictions: { country: "in" },
              sessionToken: session.current!,
            },
            (res, status) => {
              if (status === google.maps.places.PlacesServiceStatus.REQUEST_DENIED) {
                googleDenied = true;
                resolve([]);
                return;
              }
              if (status !== google.maps.places.PlacesServiceStatus.OK || !res) {
                resolve([]);
                return;
              }
              resolve(
                res.map((p) => ({
                  id: `google:${p.place_id}`,
                  mainText: p.structured_formatting.main_text,
                  secondaryText: p.structured_formatting.secondary_text ?? "",
                  source: "google" as const,
                  placeId: p.place_id,
                }))
              );
            }
          );
        });
      }

      let remote: Suggestion[] = [];
      try {
        const { data } = await api.get("/parking/places/suggest", { params: { q } });
        remote = ((data.data?.predictions ?? []) as Suggestion[]).map((p) => ({
          ...p,
          source: "local" as const,
        }));
      } catch {
        remote = [];
      }

      if (requestId !== seq.current) return;
      setDenied(googleDenied && googleItems.length === 0);
      setSuggestions(mergeSuggestions(googleItems, [...local, ...remote]));
      setActive(0);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [ready, value, placeMenu]);

  React.useEffect(() => {
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (boxRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onReposition() {
      if (open) placeMenu();
    }
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [open, placeMenu]);

  function pick(item: Suggestion) {
    if (item.source === "google" && item.placeId && window.google?.maps?.places) {
      const attr = document.createElement("div");
      const svc = new google.maps.places.PlacesService(attr);
      svc.getDetails(
        {
          placeId: item.placeId,
          fields: ["place_id", "formatted_address", "geometry", "address_components", "name"],
          sessionToken: session.current ?? undefined,
        },
        (place, status) => {
          session.current = null;
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            if (item.lat != null && item.lng != null) {
              finish(resolvedFromCatalog({ mainText: item.mainText, secondaryText: item.secondaryText, lat: item.lat, lng: item.lng }));
            }
            return;
          }
          const parsed = fromPlace(place);
          if (parsed) finish(parsed);
        }
      );
      return;
    }
    if (item.lat == null || item.lng == null) return;
    finish(resolvedFromCatalog({ mainText: item.mainText, secondaryText: item.secondaryText, lat: item.lat, lng: item.lng }));
  }

  function finish(parsed: PlaceSelection) {
    onChange(parsed.formattedAddress);
    setOpen(false);
    setSuggestions([]);
    onPlaceRef.current(parsed);
  }

  const showMenu = open && value.trim().length >= MIN_QUERY && menuPos;

  return (
    <div ref={boxRef} className="relative w-full">
      <Input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Search an address"}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={!!showMenu}
        aria-controls={listId}
        aria-activedescendant={showMenu && suggestions[active] ? `${listId}-${active}` : undefined}
        role="combobox"
        className={cn(className)}
        onFocus={() => {
          if (value.trim().length >= MIN_QUERY) {
            setOpen(true);
            placeMenu();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            return;
          }
          if (!open || suggestions.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(suggestions[active]);
          }
        }}
      />
      {denied && !hideDeniedHint && value.trim().length >= MIN_QUERY && suggestions.length === 0 && !loading && (
        <p className="mt-1.5 text-xs text-slate-500">
          Google place search isn&apos;t available on this key. Choose a listed locality or pin the map.
        </p>
      )}
      {showMenu &&
        createPortal(
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
            className="glass-strong fixed z-[80] max-h-72 overflow-auto rounded-xl py-1 shadow-pop"
          >
            {loading && suggestions.length === 0 && (
              <li className="flex items-center gap-2 px-3.5 py-3 text-sm text-slate-500">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Searching places…
              </li>
            )}
            {!loading && suggestions.length === 0 && (
              <li className="flex items-start gap-2 px-3.5 py-3 text-sm text-slate-500">
                <SearchX className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>No matching places. Try a locality such as Shahad, Kalyan or Andheri.</span>
              </li>
            )}
            {suggestions.map((p, i) => (
              <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-800",
                    i === active ? "bg-brand-50/90" : "hover:bg-white/55"
                  )}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(p)}
                >
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <span>
                    <span className="font-medium">{p.mainText}</span>
                    {p.secondaryText && (
                      <span className="mt-0.5 block text-xs text-slate-500">{p.secondaryText}</span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
