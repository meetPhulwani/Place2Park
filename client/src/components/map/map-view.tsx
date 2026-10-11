import * as React from "react";
import { GoogleMapView } from "./google-map";
import { MockMapView } from "./mock-map";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  label: string; // e.g. "₹60"
  title?: string;
}

export interface MapViewProps {
  markers: MapMarker[];
  center?: { lat: number; lng: number };
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  destination?: { lat: number; lng: number; name?: string } | null;
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
