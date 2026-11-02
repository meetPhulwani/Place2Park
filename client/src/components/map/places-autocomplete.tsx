import * as React from "react";
import { Loader2, MapPin, SearchX } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  googleMapsApiKey,
  indiaPlaceSelection,
  suggestIndiaPlaces,
  type IndiaPlaceLookup,
  type ResolvedLocation,
} from "@/lib/google-maps";
import { cn } from "@/lib/utils";

export type PlaceSelection = ResolvedLocation;

type Suggestion = {
  id: string;
  placeId: string;
  mainText: string;
  secondaryText: string;
};

const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;
const MENU_GAP = 6;
const MENU_MIN = 168;
const MENU_MAX = 288;

function viewFrame() {
  const viewport = window.visualViewport;
  return {
    top: viewport?.offsetTop ?? 0,
    bottom: viewport ? viewport.offsetTop + viewport.height : window.innerHeight,
  };
}

/** Keep the menu below the field. Lift the dock only when the keyboard leaves too little room. */
function fitMenuBelow(input: HTMLElement) {
  const dock = input.closest("[data-location-dock]") as HTMLElement | null;
  const frame = viewFrame();
  let rect = input.getBoundingClientRect();
  let room = frame.bottom - rect.bottom - MENU_GAP - 8;
  const applied = Number(dock?.dataset.menuLift || 0);

  if (dock) {
    if (room < MENU_MIN) {
      const maxExtra = Math.max(0, rect.top - (frame.top + 72));
      const extra = Math.min(maxExtra, MENU_MIN - room);
      const next = applied + extra;
      if (extra > 1) {
        dock.dataset.menuLift = String(Math.round(next));
        dock.style.transform = `translateY(-${Math.round(next)}px)`;
        rect = input.getBoundingClientRect();
        room = frame.bottom - rect.bottom - MENU_GAP - 8;
      }
    } else if (applied > 0) {
      const reduce = Math.min(applied, room - MENU_MIN);
      const next = Math.max(0, applied - reduce);
      dock.dataset.menuLift = String(Math.round(next));
      dock.style.transform = next > 0 ? `translateY(-${Math.round(next)}px)` : "";
      rect = input.getBoundingClientRect();
      room = frame.bottom - rect.bottom - MENU_GAP - 8;
    }
  }

  return Math.min(MENU_MAX, Math.max(72, room));
}

function clearMenuLift(from: HTMLElement | null) {
  const dock = from?.closest("[data-location-dock]") as HTMLElement | null;
  if (!dock) return;
  dock.style.transform = "";
  delete dock.dataset.menuLift;
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
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  const [active, setActive] = React.useState(0);
  const [unavailable, setUnavailable] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [menuMaxHeight, setMenuMaxHeight] = React.useState(MENU_MAX);
  const apiKey = googleMapsApiKey();
  const session = React.useRef<object | null>(null);
  const predictions = React.useRef<IndiaPlaceLookup["predictions"]>(new Map());
  const seq = React.useRef(0);
  const listId = `${id ?? "place"}-listbox`;

  const placeMenu = React.useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    setMenuMaxHeight(fitMenuBelow(el));
  }, []);

  React.useEffect(() => {
    const q = value.trim();
    if (q.length < MIN_QUERY) {
      seq.current += 1;
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    if (!focused) {
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
      const found = await suggestIndiaPlaces(q, session.current);
      if (requestId !== seq.current) return;
      session.current = found.sessionToken;
      predictions.current = found.predictions;
      setUnavailable(found.status === "unavailable" || !apiKey);
      setSuggestions(
        found.suggestions.map((item) => ({
          id: item.placeId,
          placeId: item.placeId,
          mainText: item.mainText,
          secondaryText: item.secondaryText,
        }))
      );
      setActive(0);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [apiKey, value, placeMenu, focused]);

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
    window.visualViewport?.addEventListener("resize", onReposition);
    window.visualViewport?.addEventListener("scroll", onReposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
      window.visualViewport?.removeEventListener("resize", onReposition);
      window.visualViewport?.removeEventListener("scroll", onReposition);
    };
  }, [open, placeMenu]);

  async function pick(item: Suggestion) {
    const prediction = predictions.current.get(item.placeId);
    if (!prediction) return;
    setLoading(true);
    const parsed = await indiaPlaceSelection(prediction);
    session.current = null;
    predictions.current = new Map();
    setLoading(false);
    if (!parsed) {
      setUnavailable(true);
      return;
    }
    finish(parsed);
  }

  function finish(parsed: PlaceSelection) {
    onChange(parsed.formattedAddress);
    setOpen(false);
    setSuggestions([]);
    onPlaceRef.current(parsed);
  }

  const showMenu = open && value.trim().length >= MIN_QUERY;

  React.useLayoutEffect(() => {
    if (!showMenu) {
      clearMenuLift(boxRef.current);
      return;
    }
    placeMenu();
  }, [showMenu, suggestions.length, placeMenu]);

  return (
    <div ref={boxRef} className="relative z-[80] w-full">
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
          setFocused(true);
          if (value.trim().length >= MIN_QUERY) {
            setOpen(true);
            placeMenu();
          }
        }}
        onBlur={() => setFocused(false)}
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
      {unavailable && !hideDeniedHint && value.trim().length >= MIN_QUERY && suggestions.length === 0 && !loading && (
        <p className="mt-1.5 text-xs text-slate-500">
          Place search is unavailable right now. Check your connection and try again.
        </p>
      )}
      {showMenu && (
          <ul
            ref={listRef}
            id={listId}
            role="listbox"
            style={{ maxHeight: menuMaxHeight, marginTop: MENU_GAP }}
            className="absolute top-full right-0 left-0 z-[80] w-full overflow-y-auto overscroll-contain rounded-xl border border-line bg-white py-1 shadow-pop"
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
                <span>
                  {unavailable
                    ? "Place search is unavailable right now. Check your connection and try again."
                    : "No matching places in India."}
                </span>
              </li>
            )}
            {suggestions.map((p, i) => (
              <li key={p.id} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left text-sm text-slate-800",
                    i === active ? "bg-brand-50" : "hover:bg-brand-50"
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
          </ul>
        )}
    </div>
  );
}
