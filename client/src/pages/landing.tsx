import * as React from "react";
import { useNavigate } from "react-router-dom";
import Link from "@/components/link";
import { LocateFixed, MapPin } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { SearchBar } from "@/components/search-bar";
import { MapView } from "@/components/map/map-view";
import Image from "@/components/image";
import { api } from "@/services/api";
import { useAuth } from "@/context/auth";
import type { Booking, SpaceSummary } from "@/types";
import { formatINR } from "@/lib/utils";
import { getDisplayLocation } from "@/lib/location";
import {
  pickRecentPlaces,
  readRecentPlaces,
  recentPlaceFromBooking,
  rememberPlace,
  type RecentPlace,
} from "@/lib/recent-places";

const MUMBAI = { lat: 19.076, lng: 72.8777 };

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [origin, setOrigin] = React.useState(MUMBAI);
  const [spaces, setSpaces] = React.useState<SpaceSummary[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [recent, setRecent] = React.useState<RecentPlace[]>(() => pickRecentPlaces([], readRecentPlaces()));

  React.useEffect(() => {
    document.title = "Place2Park — Find parking before you arrive";
  }, []);

  React.useEffect(() => {
    const searches = readRecentPlaces();
    if (!user) {
      setRecent(pickRecentPlaces([], searches));
      return;
    }
    let cancelled = false;
    api
      .get("/bookings?scope=past")
      .then(({ data }) => {
        if (cancelled) return;
        const went = ((data.data.bookings as Booking[]) ?? [])
          .map(recentPlaceFromBooking)
          .filter((place): place is RecentPlace => place != null);
        setRecent(pickRecentPlaces(went, searches));
      })
      .catch(() => {
        if (!cancelled) setRecent(pickRecentPlaces([], searches));
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  React.useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
    );
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({
      lat: String(origin.lat),
      lng: String(origin.lng),
      radius: "14",
      sort: "closest",
    });
    api
      .get(`/parking/search?${qs}`)
      .then(({ data }) => {
        if (!cancelled) setSpaces((data.data.results as SpaceSummary[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setSpaces([]);
      });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  const markers = spaces
    .filter((s) => Number.isFinite(s.latitude) && Number.isFinite(s.longitude))
    .map((s) => ({
      id: s.id,
      lat: s.latitude,
      lng: s.longitude,
      label: formatINR(s.pricePerHour),
      title: s.title,
    }));

  const selected = spaces.find((s) => s.id === selectedId) ?? null;

  function locate() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  }

  return (
    <div className="relative isolate h-dvh overflow-hidden bg-page">
      <div className="absolute inset-x-0 top-0 z-40">
        <Navbar overlay />
      </div>

      <div className="absolute inset-0 z-0">
        <MapView
          markers={markers}
          center={origin}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-full w-full"
        />
        <button
          type="button"
          onClick={locate}
          className="absolute right-3 top-[4.75rem] z-20 flex size-10 items-center justify-center rounded-full border border-line bg-white text-brand-600 shadow-card transition-colors hover:bg-brand-50 sm:right-4"
          aria-label="Use my location"
        >
          <LocateFixed className="size-4" aria-hidden />
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-stretch">
        {selected && (
          <Link
            href={`/parking/${selected.id}`}
            className="pointer-events-auto mx-3 mb-2 flex gap-3 rounded-2xl border border-line bg-white p-3 shadow-pop sm:mx-4 sm:w-80 sm:self-end"
          >
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-page">
              {selected.imageUrl && (
                <Image src={selected.imageUrl} alt="" fill sizes="64px" className="object-cover" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">{selected.title}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{getDisplayLocation(selected)}</p>
              <p className="mt-1 text-sm font-semibold text-brand-600">
                {formatINR(selected.pricePerHour)}
                <span className="font-normal text-muted">/hr</span>
              </p>
            </div>
          </Link>
        )}
        <section className="pointer-events-auto w-full rounded-t-2xl border border-b-0 border-line bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-pop sm:rounded-t-3xl sm:px-6 sm:pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h1 className="font-display text-lg font-semibold tracking-tight text-ink sm:text-xl">
                Where to?
              </h1>
              <p className="text-xs text-muted sm:text-sm">Reserve a spot before you leave.</p>
            </div>
            <Link
              href="/become-a-host"
              className="hidden shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700 sm:inline"
            >
              List a space
            </Link>
          </div>
          <div className="mt-3">
            <SearchBar variant="dock" />
          </div>
          {recent.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {recent.map((place) => (
                <button
                  key={place.q}
                  type="button"
                  onClick={() => {
                    rememberPlace(place);
                    const params = new URLSearchParams({ q: place.q });
                    if (place.lat != null && place.lng != null) {
                      params.set("lat", String(place.lat));
                      params.set("lng", String(place.lng));
                      params.set("radius", "12");
                    }
                    navigate(`/search?${params.toString()}`);
                  }}
                  className="flex min-w-0 items-center gap-2.5 rounded-xl border border-line bg-mist-50 px-2.5 py-2 text-left transition-colors hover:border-brand-400 hover:bg-brand-50"
                >
                  <div className="relative size-10 shrink-0 overflow-hidden rounded-lg bg-white">
                    {place.imageUrl ? (
                      <Image src={place.imageUrl} alt="" fill sizes="40px" className="object-cover" />
                    ) : (
                      <span className="flex size-full items-center justify-center text-brand-500">
                        <MapPin className="size-4" aria-hidden />
                      </span>
                    )}
                  </div>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-ink">{place.label}</span>
                    {place.city && (
                      <span className="block truncate text-xs text-muted">{place.city}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
