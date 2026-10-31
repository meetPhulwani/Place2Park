import * as React from "react";
import { MapPinned } from "lucide-react";
import Link from "@/components/link";
import type { MapViewProps } from "./map-view";
import { frameDestinationView } from "@/lib/destination";
import { cn } from "@/lib/utils";

/**
 * Offline development map — clearly labelled, no fake tiles.
 * Projects markers onto a plain canvas so map/list sync, selection and
 * relative positions still work without a Google Maps key.
 */
export function MockMapView({
  markers,
  center,
  selectedId,
  onSelect,
  onOpen,
  destination,
  className,
}: MapViewProps) {
  const [destinationOpen, setDestinationOpen] = React.useState(false);
  const destinationKey = destination
    ? `${destination.lat.toFixed(5)}:${destination.lng.toFixed(5)}:${destination.name ?? ""}`
    : "";
  React.useEffect(() => {
    setDestinationOpen(false);
  }, [destinationKey]);

  const framed = destination
    ? frameDestinationView(destination, markers, 800).points
    : markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const pts = [...framed];
  if (center && pts.length === 0) pts.push(center);
  if (pts.length === 0) pts.push({ lat: 19.076, lng: 72.8777 });

  let minLat = Math.min(...pts.map((p) => p.lat));
  let maxLat = Math.max(...pts.map((p) => p.lat));
  let minLng = Math.min(...pts.map((p) => p.lng));
  let maxLng = Math.max(...pts.map((p) => p.lng));
  // Padding so markers don't hug the edges; avoid zero-size ranges.
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.004);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.004);
  minLat -= latPad; maxLat += latPad; minLng -= lngPad; maxLng += lngPad;

  const project = (lat: number, lng: number) => ({
    x: ((lng - minLng) / (maxLng - minLng)) * 100,
    y: ((maxLat - lat) / (maxLat - minLat)) * 100,
  });

  return (
    <div
      role="application"
      aria-label="Map of parking spaces (offline preview)"
      className={cn("relative overflow-hidden bg-[#F3F4F6]", className)}
    >
      {/* Abstract terrain texture */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(100,116,139,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.10) 1px, transparent 1px), radial-gradient(circle at 20% 30%, rgba(108,122,137,0.08) 0 18%, transparent 22%), radial-gradient(circle at 75% 65%, rgba(100,116,139,0.08) 0 22%, transparent 26%)",
          backgroundSize: "44px 44px, 44px 44px, 100% 100%, 100% 100%",
        }}
      />
      {/* Destination */}
      {destination && (
        <button
          type="button"
          className="absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{
            left: `${project(destination.lat, destination.lng).x}%`,
            top: `${project(destination.lat, destination.lng).y}%`,
          }}
          aria-label={destination.name ?? "Destination"}
          aria-expanded={destinationOpen}
          onClick={() => setDestinationOpen((open) => !open)}
        >
          <span className="relative block">
            <span className="block size-5 rounded-full border-[3px] border-ink bg-volt shadow-[0_2px_6px_rgba(17,24,39,0.45)]" />
            <span className="absolute left-1/2 top-4 size-2.5 -translate-x-1/2 rotate-45 border-b-[3px] border-r-[3px] border-ink bg-volt" />
          </span>
          {destinationOpen && destination.name && (
            <span className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-2 py-1 text-[11px] font-medium text-ink shadow-card">
              {destination.name}
            </span>
          )}
        </button>
      )}
      {/* Markers */}
      {markers.map((m) => {
        const p = project(m.lat, m.lng);
        const selected = m.id === selectedId;
        return (
          <React.Fragment key={m.id}>
          <button
            type="button"
            onClick={() => onSelect?.(m.id)}
            aria-label={`${m.title ?? "Parking space"} — ${m.label}${m.detail ? `, ${m.detail}` : ""}`}
            title={m.detail ? `${m.title ?? "Parking"} — ${m.detail}` : m.title}
            aria-pressed={selected}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-full rounded-full border px-2.5 py-1 text-xs font-semibold shadow-md transition-all",
              selected
                ? "z-20 scale-110 border-brand-500 bg-white text-ink ring-2 ring-brand-500"
                : "z-10 border-mist bg-white text-ink hover:border-brand-500 hover:text-brand-700"
            )}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {m.label}
            <span
              aria-hidden
              className={cn(
                "absolute left-1/2 top-full -mt-px size-2 -translate-x-1/2 rotate-45 border-b border-r",
                selected ? "border-brand-500 bg-white" : "border-mist bg-white"
              )}
              style={{ marginTop: "-5px" }}
            />
          </button>
          {selected && m.href && (
            <Link
              href={m.href}
              onClick={(event) => {
                if (!onOpen) return;
                event.preventDefault();
                onOpen(m.href!);
              }}
              className="absolute z-30 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-white px-2.5 py-1.5 text-left shadow-card"
              style={{ left: `${p.x}%`, top: `calc(${p.y}% - 2.25rem)` }}
            >
              <span className="block text-[11px] font-semibold text-ink">{m.title ?? "Parking"}</span>
              <span className="mt-0.5 block text-[11px] font-semibold text-brand-600">Book this space</span>
            </Link>
          )}
          </React.Fragment>
        );
      })}
      {/* Offline notice */}
      <div className="glass-strong absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-1.5 text-xs text-slate-600">
        <MapPinned className="size-3.5 text-brand-700" aria-hidden />
        Offline map preview — set
        <code className="rounded bg-slate-100 px-1 font-mono text-[10px]">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>
        for Google Maps
      </div>
    </div>
  );
}
