import * as React from "react";
import type { MapViewProps } from "./map-view";
import { cn } from "@/lib/utils";
import { loadGoogleMaps } from "@/lib/google-maps";
import { destinationPan, frameDestinationView, viewportPoints } from "@/lib/destination";

const DESTINATION_PIN =
  "M0,0 C-2,-18 -10,-20 -10,-30 A10,10 0 1 1 10,-30 C10,-20 2,-18 0,0 z";

function shiftedCenter(
  map: google.maps.Map,
  center: { lat: number; lng: number },
  zoom: number,
  panX: number,
  panY: number
) {
  if (Math.abs(panX) <= 4 && Math.abs(panY) <= 4) return center;
  const projection = map.getProjection();
  const world = projection?.fromLatLngToPoint(new google.maps.LatLng(center.lat, center.lng));
  if (!projection || !world) return null;
  const scale = 2 ** zoom;
  return projection.fromPointToLatLng(new google.maps.Point(world.x + panX / scale, world.y + panY / scale));
}

function infoNode(title: string, subtitle?: string, href?: string, onOpen?: (href: string) => void) {
  const wrap = document.createElement(href ? "a" : "div");
  if (href && wrap instanceof HTMLAnchorElement) {
    wrap.href = href;
    wrap.style.cursor = "pointer";
    wrap.style.display = "block";
    wrap.style.textDecoration = "none";
    wrap.style.color = "inherit";
    wrap.addEventListener("click", (event) => {
      if (!onOpen) return;
      event.preventDefault();
      onOpen(href);
    });
  }
  const heading = document.createElement("p");
  heading.textContent = title;
  heading.style.margin = "0";
  heading.style.fontWeight = "600";
  heading.style.color = "#111827";
  wrap.appendChild(heading);
  if (subtitle) {
    const sub = document.createElement("p");
    sub.textContent = subtitle;
    sub.style.margin = "2px 0 0";
    sub.style.fontSize = "12px";
    sub.style.color = "#0251B0";
    wrap.appendChild(sub);
  }
  if (href) {
    const action = document.createElement("p");
    action.textContent = "Book this space";
    action.style.margin = "6px 0 0";
    action.style.fontSize = "12px";
    action.style.fontWeight = "600";
    action.style.color = "#0251B0";
    wrap.appendChild(action);
  }
  return wrap;
}

export function GoogleMapView({
  apiKey,
  markers,
  center,
  selectedId,
  onSelect,
  onOpen,
  destination,
  occlusion,
  className,
}: MapViewProps & { apiKey: string }) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerRefs = React.useRef<Map<string, google.maps.Marker>>(new Map());
  const destRef = React.useRef<google.maps.Marker | null>(null);
  const infoRef = React.useRef<google.maps.InfoWindow | null>(null);
  const [error, setError] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const markerKey = markers.map((m) => `${m.id}:${m.lat.toFixed(5)}:${m.lng.toFixed(5)}`).join("|");
  const destKey = destination ? `${destination.lat.toFixed(5)}:${destination.lng.toFixed(5)}:${destination.name ?? ""}` : "";
  const markersRef = React.useRef(markers);
  const destinationRef = React.useRef(destination);
  const occlusionRef = React.useRef(occlusion);
  const panToken = React.useRef(0);
  const onOpenRef = React.useRef(onOpen);
  onOpenRef.current = onOpen;
  markersRef.current = markers;
  destinationRef.current = destination;
  occlusionRef.current = occlusion;
  const occlusionKey = occlusion
    ? `${Math.round(occlusion.left)}:${Math.round(occlusion.top)}:${Math.round(occlusion.right)}:${Math.round(occlusion.bottom)}`
    : "";

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
          infoRef.current = new google.maps.InfoWindow();
        }
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
    };
  }, [apiKey, center]);

  React.useEffect(() => {
    if (!ready || !center || !mapRef.current) return;
    mapRef.current.panTo(center);
  }, [ready, center]);

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
        fillColor: "#ffffff",
        fillOpacity: 1,
        strokeColor: isSelected ? "#0251B0" : "#C7D1DD",
        strokeWeight: isSelected ? 2.5 : 1.5,
        scale: 1,
        labelOrigin: new google.maps.Point(0, -8),
      } satisfies google.maps.Symbol;
      if (!marker) {
        const created = new google.maps.Marker({
          map,
          position: { lat: m.lat, lng: m.lng },
          title: m.title,
          icon,
          label: {
            text: m.label,
            color: "#111827",
            fontSize: "12px",
            fontWeight: "600",
          },
        });
        created.addListener("click", () => {
          onSelect?.(m.id);
          const title = String(created.get("placeTitle") || m.title || "Parking");
          const detail = String(created.get("placeDetail") || "");
          const href = String(created.get("placeHref") || "");
          infoRef.current?.setContent(
            infoNode(title, detail || undefined, href || undefined, (path) => onOpenRef.current?.(path))
          );
          infoRef.current?.open({ map, anchor: created });
        });
        markerRefs.current.set(m.id, created);
        marker = created;
      } else {
        marker.setPosition({ lat: m.lat, lng: m.lng });
        marker.setIcon(icon);
        marker.setLabel({
          text: m.label,
          color: "#111827",
          fontSize: "12px",
          fontWeight: "600",
        });
      }
      marker.setZIndex(isSelected ? 999 : 1);
      marker.set("placeTitle", m.title ?? "Parking");
      marker.set("placeDetail", m.detail ?? "");
      marker.set("placeHref", m.href ?? "");
    }
    for (const [id, marker] of markerRefs.current) {
      if (!seen.has(id)) {
        marker.setMap(null);
        markerRefs.current.delete(id);
      }
    }
  }, [ready, markers, selectedId, onSelect]);

  // Destination marker — kept separate so parking markers and filters cannot remove it.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const destination = destinationRef.current;
    destRef.current?.setMap(null);
    destRef.current = null;
    infoRef.current?.close();
    if (!destination) return;
    const title = destination.name ?? "Destination";
    const marker = new google.maps.Marker({
      map,
      position: { lat: destination.lat, lng: destination.lng },
      title,
      zIndex: 2000,
      icon: {
        path: DESTINATION_PIN,
        fillColor: "#D1FF42",
        fillOpacity: 1,
        strokeColor: "#111827",
        strokeWeight: 2,
        scale: 1.25,
        anchor: new google.maps.Point(0, 0),
      },
    });
    marker.addListener("click", () => {
      infoRef.current?.setContent(infoNode(title, "Searched destination"));
      infoRef.current?.open({ map, anchor: marker });
    });
    destRef.current = marker;
  }, [ready, destKey]);

  const fitView = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    google.maps.event.trigger(map, "resize");
    const destination = destinationRef.current;
    const rect = containerRef.current?.getBoundingClientRect();
    const pan = destinationPan(rect?.width ?? 0, rect?.height ?? 0, occlusionRef.current);
    if (destination && Number.isFinite(destination.lat) && Number.isFinite(destination.lng)) {
      const frame = frameDestinationView(destination, markersRef.current, pan.viewportPx);
      const token = ++panToken.current;
      map.setZoom(frame.zoom);
      const shifted = shiftedCenter(map, frame.center, frame.zoom, pan.x, pan.y);
      if (shifted) {
        map.setCenter(shifted);
        return;
      }
      map.setCenter(frame.center);
      if (Math.abs(pan.x) <= 4 && Math.abs(pan.y) <= 4) return;
      google.maps.event.addListenerOnce(map, "idle", () => {
        if (token !== panToken.current) return;
        map.panBy(pan.x, pan.y);
      });
      return;
    }
    const points = viewportPoints(null, markersRef.current);
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setCenter(points[0]!);
      map.setZoom(15);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 64);
    google.maps.event.addListenerOnce(map, "idle", () => {
      const zoom = map.getZoom();
      if (zoom != null && zoom > 16) map.setZoom(16);
    });
  }, []);

  React.useEffect(() => {
    if (!ready) return;
    const el = containerRef.current;
    const map = mapRef.current;
    if (!el || !map) return;
    let width = 0;
    let height = 0;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width < 20 || rect.height < 20) return;
      if (Math.abs(rect.width - width) < 32 && Math.abs(rect.height - height) < 32) return;
      width = rect.width;
      height = rect.height;
      fitView();
    });
    observer.observe(el);
    fitView();
    return () => observer.disconnect();
  }, [ready, markerKey, destKey, occlusionKey, fitView]);

  if (error) {
    return (
      <div className={cn("flex items-center justify-center bg-slate-100 text-sm text-slate-500", className)}>
        Map failed to load. Check your Google Maps API key.
      </div>
    );
  }
  return <div ref={containerRef} className={className} role="application" aria-label="Map of parking spaces" />;
}
