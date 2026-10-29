import * as React from "react";
import { MapPinned } from "lucide-react";
import type { MapViewProps } from "./map-view";
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
  destination,
  className,
}: MapViewProps) {
  const pts = [...markers.map((m) => ({ lat: m.lat, lng: m.lng }))];
  if (destination) pts.push({ lat: destination.lat, lng: destination.lng });
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
        <div
          className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${project(destination.lat, destination.lng).x}%`,
            top: `${project(destination.lat, destination.lng).y}%`,
          }}
          title={destination.name ?? "Destination"}
        >
          <span className="block size-4 rounded-full border-[3px] border-white bg-slate-900 shadow-md" />
          {destination.name && (
            <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-1.5 py-0.5 text-[10px] font-medium text-white">
              {destination.name}
            </span>
          )}
        </div>
      )}
      {/* Markers */}
      {markers.map((m) => {
        const p = project(m.lat, m.lng);
        const selected = m.id === selectedId;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect?.(m.id)}
            aria-label={`${m.title ?? "Parking space"} — ${m.label}`}
            aria-pressed={selected}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-full rounded-full border px-2.5 py-1 text-xs font-semibold shadow-md transition-all",
              selected
                ? "z-20 scale-110 border-brand-700 bg-brand-700 text-white"
                : "z-10 border-slate-300 bg-white text-slate-800 hover:border-brand-500 hover:text-brand-800"
            )}
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {m.label}
            <span
              aria-hidden
              className={cn(
                "absolute left-1/2 top-full -mt-px size-2 -translate-x-1/2 rotate-45 border-b border-r",
                selected ? "border-brand-700 bg-brand-700" : "border-slate-300 bg-white"
              )}
              style={{ marginTop: "-5px" }}
            />
          </button>
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
