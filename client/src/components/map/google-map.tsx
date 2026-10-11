import * as React from "react";
import type { MapViewProps } from "./map-view";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/google-maps";

export function GoogleMapView({
  apiKey,
  markers,
  center,
  selectedId,
  onSelect,
  destination,
  className,
}: MapViewProps & { apiKey: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerRefs = React.useRef<Map<string, google.maps.Marker>>(new Map());
  const destRef = React.useRef<google.maps.Marker | null>(null);
  const [error, setError] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !containerRef.current) return;
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center: center ?? { lat: 19.076, lng: 72.8777 },
            zoom: 13,
            disableDefaultUI: true,
            zoomControl: true,
            clickableIcons: false,
          });
        }
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey, center]);

  // Sync markers
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const seen = new Set<string>();
    for (const m of markers) {
      seen.add(m.id);
      let marker = markerRefs.current.get(m.id);
      const isSelected = m.id === selectedId;
      const icon = {
        path: "M -22,-14 a 6 6 0 0 1 6,-6 h 32 a 6 6 0 0 1 6,6 v 12 a 6 6 0 0 1 -6,6 h -10 l -6,7 -6,-7 h -10 a 6 6 0 0 1 -6,-6 z",
        fillColor: isSelected ? "#0f6353" : "#ffffff",
        fillOpacity: 1,
        strokeColor: isSelected ? "#0f6353" : "#cbd5e1",
        strokeWeight: 1.5,
        scale: 1,
        labelOrigin: new google.maps.Point(0, -8),
      } satisfies google.maps.Symbol;
      if (!marker) {
        marker = new google.maps.Marker({
          map,
          position: { lat: m.lat, lng: m.lng },
          title: m.title,
          icon,
          label: {
            text: m.label,
            color: isSelected ? "#ffffff" : "#0f172a",
            fontSize: "12px",
            fontWeight: "600",
          },
        });
        marker.addListener("click", () => onSelect?.(m.id));
        markerRefs.current.set(m.id, marker);
      } else {
        marker.setIcon(icon);
        marker.setLabel({
          text: m.label,
          color: isSelected ? "#ffffff" : "#0f172a",
          fontSize: "12px",
          fontWeight: "600",
        });
        marker.setZIndex(isSelected ? 999 : undefined!);
      }
    }
    for (const [id, marker] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markerRefs.current.delete(id);
      }
    }
    // Fit bounds when markers change
    if (markers.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      markers.forEach((m) => bounds.extend({ lat: m.lat, lng: m.lng }));
      if (destination) bounds.extend({ lat: destination.lat, lng: destination.lng });
      map.fitBounds(bounds, 48);
    }
  }, [ready, markers, selectedId, onSelect, destination]);

  // Destination marker
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    destRef.current?.setMap(null);
    if (destination) {
      destRef.current = new google.maps.Marker({
        map,
        position: { lat: destination.lat, lng: destination.lng },
        title: destination.name ?? "Destination",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#0f172a",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2.5,
        },
      });
    }
  }, [ready, destination]);

  // Pan to selection
  React.useEffect(() => {
    if (!ready || !selectedId) return;
    const m = markers.find((x) => x.id === selectedId);
    if (m) mapRef.current?.panTo({ lat: m.lat, lng: m.lng });
  }, [ready, selectedId, markers]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-sm text-slate-500", className)}>
        Map failed to load. Check your Google Maps API key.
      </div>
    );
  }
  return <div ref={containerRef} className={className} role="application" aria-label="Map of parking spaces" />;
}
