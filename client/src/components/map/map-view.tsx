import * as React from "react";
import { GoogleMapView } from "./google-map";
import { MockMapView } from "./mock-map";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "₹60"
  title?: string;
  /** Straight-line distance or other factual subtitle. Omit when unknown. */
  detail?: string;
  /** Parking page for this marker. The map card opens it on click. */
  href?: string;
}

export interface MapViewProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Called when the open parking card is clicked. Receives the marker href. */
  onOpen?: (href: string) => void;
  destination?: { lat: number; lng: number; name?: string } | null;
  /** Pixels of the map covered by the results card. Keeps the destination pin in view. */
  occlusion?: { left: number; top: number; right: number; bottom: number };
  className?: string;
}

/**
 * Map abstraction: renders Google Maps when VITE_GOOGLE_MAPS_API_KEY is
 * configured, otherwise a clearly-labelled offline mock map with the same API.
 */
export function MapView(props: MapViewProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  if (apiKey) return <GoogleMapView apiKey={apiKey} {...props} />;
  return <MockMapView {...props} />;
}
