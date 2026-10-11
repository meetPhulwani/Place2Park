import * as React from "react";
import { LocateFixed, MapPin, Search } from "lucide-react";
import { PlacesAutocomplete } from "@/components/map/places-autocomplete";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/input";
import {
  googleMapsApiKey,
  loadGoogleMaps,
  reverseGeocode,
  type ResolvedLocation,
} from "@/lib/google-maps";
import { getDisplayLocation, locationFromLabel, shortSearchQuery } from "@/lib/location";

export interface LocationFields {
  address: string;
  formattedAddress: string;
  locality: string;
  sublocality: string;
  area: string;
  city: string;
  district: string;
  state: string;
  pincode: string;
  postalCode: string;
  placeId: string;
  latitude: string;
  longitude: string;
}

function toFields(loc: ResolvedLocation): LocationFields {
  return {
    address: loc.formattedAddress || loc.address,
    formattedAddress: loc.formattedAddress || loc.address,
    locality: loc.locality,
    sublocality: loc.sublocality,
    area: loc.area,
    city: loc.city,
    district: loc.district,
    state: loc.state,
    pincode: loc.pincode || loc.postalCode,
    postalCode: loc.postalCode || loc.pincode,
    placeId: loc.placeId,
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
  };
}

function PinMap({
  apiKey,
  lat,
  lng,
  onDrag,
}: {
  apiKey: string;
  lat: number | null;
  lng: number | null;
  onDrag: (lat: number, lng: number) => void;
}) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<google.maps.Map | null>(null);
  const markerRef = React.useRef<google.maps.Marker | null>(null);
  const onDragRef = React.useRef(onDrag);
  onDragRef.current = onDrag;
  const [mapReady, setMapReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const start = { lat: 22.3511, lng: 78.6677 };
      const map = new google.maps.Map(containerRef.current, {
        center: start,
        zoom: 5,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });
      map.addListener("click", (e: google.maps.MapMouseEvent) => {
        const p = e.latLng;
        if (!p) return;
        onDragRef.current(p.lat(), p.lng());
      });
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  React.useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || lat == null || lng == null) return;
    const pos = { lat, lng };
    map.panTo(pos);
    if ((map.getZoom() ?? 5) < 16) map.setZoom(17);
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({
        map,
        position: pos,
        draggable: true,
        animation: google.maps.Animation.DROP,
      });
      markerRef.current.addListener("dragend", () => {
        const p = markerRef.current?.getPosition();
        if (p) onDragRef.current(p.lat(), p.lng());
      });
    } else {
      markerRef.current.setPosition(pos);
    }
  }, [mapReady, lat, lng]);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full sm:h-80"
      role="application"
      aria-label="Place the pin on your parking space"
    />
  );
}

export function LocationPicker({
  value,
  onChange,
  error,
}: {
  value: LocationFields;
  onChange: (next: LocationFields) => void;
  error?: string;
}) {
  const apiKey = googleMapsApiKey();
  const [query, setQuery] = React.useState(() =>
    value.city && value.city !== "Unknown" ? getDisplayLocation(value) : ""
  );
  const [geoBusy, setGeoBusy] = React.useState(false);
  const [geoMessage, setGeoMessage] = React.useState<string | null>(null);
  const lat = parseFloat(value.latitude);
  const lng = parseFloat(value.longitude);
  const hasPin = Number.isFinite(lat) && Number.isFinite(lng);

  async function applyCoords(nextLat: number, nextLng: number, preset?: ResolvedLocation) {
    const lookedUp = preset ?? (await reverseGeocode(nextLat, nextLng));
    const fromTypedQuery = query.trim().length >= 2 ? locationFromLabel(query, nextLat, nextLng) : null;
    const loc: ResolvedLocation = lookedUp ?? (fromTypedQuery
      ? { ...fromTypedQuery, pincode: fromTypedQuery.postalCode }
      : {
          address: "Pinned parking location",
          formattedAddress: "Pinned parking location",
          locality: "",
          sublocality: "",
          area: "Selected on map",
          city: "Unknown",
          district: "",
          state: "Unknown",
          pincode: "",
          postalCode: "",
          placeId: "",
          latitude: nextLat,
          longitude: nextLng,
        });
    onChange(toFields({ ...loc, latitude: nextLat, longitude: nextLng }));
  }

  function useCurrentLocation() {
    setGeoMessage(null);
    if (!navigator.geolocation) {
      setGeoMessage("Location isn't available in this browser. Search for your location instead.");
      return;
    }
    setGeoBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await applyCoords(pos.coords.latitude, pos.coords.longitude);
        } finally {
          setGeoBusy(false);
        }
      },
      (err) => {
        setGeoBusy(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoMessage("Location access was denied. You can search for your location instead.");
        } else {
          setGeoMessage("Couldn't read your location. You can search instead.");
        }
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
        <p className="font-medium">The exact address is only shared with confirmed bookings.</p>
        <p className="mt-1 text-brand-800">
          Before booking, drivers see the approximate area. After a confirmed booking, they receive
          the exact location and access instructions.
        </p>
      </div>

      {!apiKey ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Google Maps needs to be configured to pin your parking location.
        </p>
      ) : (
        <>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <PlacesAutocomplete
              id="w-place-search"
              value={query}
              onChange={setQuery}
              className="h-12 pl-11 text-base"
              placeholder="Search your building, society or landmark"
              onPlace={(p) => {
                setQuery(shortSearchQuery(p) || p.formattedAddress);
                onChange(toFields(p));
              }}
            />
          </div>

          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={useCurrentLocation}
            loading={geoBusy}
          >
            <LocateFixed className="size-4" aria-hidden />
            Use my current location
          </Button>
          {geoMessage && (
            <p role="status" className="text-sm text-amber-800">
              {geoMessage}
            </p>
          )}

          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <PinMap apiKey={apiKey} lat={hasPin ? lat : null} lng={hasPin ? lng : null} onDrag={applyCoords} />
          </div>
          <p className="text-xs text-slate-400">
            Drag the pin — or tap the map — to the exact parking entrance.
          </p>
        </>
      )}

      {hasPin && value.address && (
        <div className="glass rounded-2xl px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <MapPin className="size-3.5 text-brand-700" aria-hidden />
            Selected location
          </p>
          <p className="mt-1.5 text-[15px] font-semibold text-slate-900">
            {value.city === "Unknown" ? "Pinned on the map" : getDisplayLocation(value)}
          </p>
          {value.city !== "Unknown" && (
            <p className="text-sm text-slate-500">
              {[value.district, value.state].filter((x) => x && x !== value.city && x !== value.area).join(", ")}
            </p>
          )}
          {value.city === "Unknown" && (
            <p className="text-sm text-slate-500">Drag the pin to the exact parking entrance.</p>
          )}
        </div>
      )}
      <FieldError error={error} />
    </div>
  );
}

export function isValidPickedLocation(value: LocationFields) {
  const lat = Number(value.latitude);
  const lng = Number(value.longitude);
  return (
    Number.isFinite(lat) &&
    lat >= -90 &&
    lat <= 90 &&
    Number.isFinite(lng) &&
    lng >= -180 &&
    lng <= 180 &&
    value.address.trim().length >= 4 &&
    value.area.trim().length >= 2 &&
    value.city.trim().length >= 2 &&
    !["unknown", "selected on map"].includes(value.area.toLowerCase()) &&
    !["unknown", "selected on map"].includes(value.city.toLowerCase())
  );
}
