import * as React from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Link from "@/components/link";
import {
  BadgeCheck, Bike, Car, Cctv, DoorOpen, ExternalLink, KeyRound, MapPin,
  Ruler, ShieldCheck, Umbrella, UserCheck, Zap,
} from "lucide-react";
import { api, errorStatus } from "@/services/api";
import { useAuth } from "@/context/auth";
import type { HostInfo, ParkingSpaceFull, Review } from "@/types";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Gallery } from "@/components/gallery";
import { BookingWidget } from "@/components/booking-widget";
import { FavoriteButton } from "@/components/favorite-button";
import { ReportDialog } from "@/components/report-dialog";
import { ReviewCard } from "@/components/review-card";
import { MapView } from "@/components/map/map-view";
import { Rating } from "@/components/ui/rating";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { gmapsDirectionsUrl } from "@/lib/geo";
import { getDisplayLocation } from "@/lib/location";
import { formatINR } from "@/lib/utils";
import {
  LEVEL_LABELS, PROPERTY_TYPE_LABELS, type Level, type PropertyType,
} from "@/lib/constants";
import NotFoundPage from "./not-found";

interface DetailData {
  space: ParkingSpaceFull;
  host: HostInfo | null;
  reviews: Review[];
  isOwner: boolean;
  isFavorite: boolean;
  revealExactLocation?: boolean;
}

export default function ParkingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = React.useState<DetailData | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (authLoading) return; // wait so the request carries the auth token
    let cancelled = false;
    api
      .get(`/parking/${id}`)
      .then(({ data: d }) => !cancelled && setData(d.data))
      .catch((e) => {
        if (cancelled) return;
        if (errorStatus(e) === 404) setNotFound(true);
        else setLoadError("Couldn't load this listing. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, authLoading]);

  React.useEffect(() => {
    if (data) document.title = `${data.space.title} — ${getDisplayLocation(data.space)} · Parkly`;
  }, [data]);

  if (notFound) return <NotFoundPage />;
  if (loadError) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {loadError}
          </p>
        </main>
      </>
    );
  }
  if (!data) {
    return (
      <>
        <Navbar />
        <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
          <Skeleton className="h-9 w-2/3" />
          <div className="grid gap-8 lg:grid-cols-[1fr_400px]">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl" />
          </div>
        </main>
      </>
    );
  }

  const { space, host, reviews, isOwner, isFavorite, revealExactLocation } = data;
  const displayLocation = getDisplayLocation(space);
  const showExactAddress = !!revealExactLocation;
  const rules = space.rules ?? [];
  const vehicles = space.vehicleTypes.split(",");
  const dims =
    space.lengthFt && space.widthFt
      ? `${space.lengthFt} × ${space.widthFt}${space.heightFt ? ` × ${space.heightFt}` : ""} ft`
      : null;

  const facts = [
    { icon: DoorOpen, label: PROPERTY_TYPE_LABELS[space.propertyType as PropertyType] },
    { icon: MapPin, label: LEVEL_LABELS[space.level as Level] },
    { icon: Umbrella, label: space.covered ? "Covered" : "Uncovered", show: true },
    { icon: Zap, label: "EV charging", show: space.evCharging },
    { icon: Cctv, label: "CCTV monitored", show: space.cctv },
    { icon: UserCheck, label: "Security guard", show: space.securityGuard },
    { icon: ShieldCheck, label: "Gated access", show: space.gated },
    ...(dims ? [{ icon: Ruler, label: dims, show: true }] : []),
  ].filter((f) => f.show !== false);

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const schedule =
    space.availability.length === 0
      ? [{ label: "Every day", time: "Open 24 hours" }]
      : [...space.availability]
          .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
          .map((r) => ({
            label: weekdays[r.dayOfWeek],
            time: `${fmtMin(r.startMinute)} – ${fmtMin(r.endMinute)}`,
          }));

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                {space.title}
              </h1>
              {space.verified && (
                <Badge variant="brand">
                  <BadgeCheck className="size-3.5" aria-hidden />
                  Verified
                </Badge>
              )}
              {space.status === "PAUSED" && <Badge variant="warning">Currently paused</Badge>}
              {space.isDemo && <Badge variant="outline">Demo listing</Badge>}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-500">
              <MapPin className="size-4" aria-hidden />
              {displayLocation}
              <span aria-hidden>·</span>
              <Rating value={space.ratingAvg} count={space.ratingCount} />
              <span aria-hidden>·</span>
              {space.bookingsCount} completed bookings
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <FavoriteButton spaceId={space.id} initialSaved={isFavorite} loggedIn={!!user} />
            {showExactAddress && (
              <a
                href={gmapsDirectionsUrl(space.latitude, space.longitude)}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-chip inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white/70"
              >
                <ExternalLink className="size-4" aria-hidden />
                Directions
              </a>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_400px]">
          {/* Left column */}
          <div className="min-w-0 space-y-8">
            <Gallery
              images={space.images.map((i) => ({ url: i.url, alt: i.alt }))}
              title={space.title}
            />

            {/* Key facts */}
            <section aria-labelledby="facts-heading">
              <h2 id="facts-heading" className="text-lg font-semibold text-slate-900">
                About this space
              </h2>
              {space.description && (
                <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{space.description}</p>
              )}
              <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {facts.map((f) => (
                  <li
                    key={f.label}
                    className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-700"
                  >
                    <f.icon className="size-4.5 shrink-0 text-brand-700" aria-hidden />
                    {f.label}
                  </li>
                ))}
                <li className="glass flex items-center gap-2.5 rounded-xl px-3.5 py-3 text-sm text-slate-700">
                  <span className="flex gap-1.5">
                    {vehicles.includes("CAR") && <Car className="size-4.5 text-brand-700" aria-label="Cars" />}
                    {vehicles.includes("BIKE") && <Bike className="size-4.5 text-brand-700" aria-label="Bikes" />}
                  </span>
                  {vehicles.map((v) => (v === "CAR" ? "Cars" : "Bikes")).join(" & ")}
                </li>
              </ul>
            </section>

            {/* Location */}
            <section aria-labelledby="location-heading">
              <h2 id="location-heading" className="text-lg font-semibold text-slate-900">
                Location
              </h2>
              <p className="mt-1.5 text-sm text-slate-500">
                {showExactAddress && space.address && space.address !== displayLocation
                  ? space.address
                  : displayLocation}
              </p>
              {!showExactAddress && (
                <p className="mt-1 text-xs text-slate-400">
                  Approximate area — the exact address is shared after a confirmed booking.
                </p>
              )}
              <div className="glass mt-3 h-64 overflow-hidden rounded-2xl">
                <MapView
                  markers={[
                    {
                      id: space.id,
                      lat: space.latitude,
                      lng: space.longitude,
                      label: formatINR(space.pricePerHour),
                      title: space.title,
                    },
                  ]}
                  selectedId={space.id}
                  className="h-full w-full"
                />
              </div>
            </section>

            {/* Access & rules */}
            <section aria-labelledby="rules-heading" className="grid gap-6 sm:grid-cols-2">
              <div>
                <h2 id="rules-heading" className="text-lg font-semibold text-slate-900">
                  Access
                </h2>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">
                  {showExactAddress
                    ? space.accessInstructions || "Show your booking code at the entrance."
                    : "Access instructions are shared after booking."}
                </p>
                <h3 className="mt-5 text-sm font-semibold text-slate-900">Availability</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {schedule.map((s, i) => (
                    <li key={i} className="flex justify-between gap-4">
                      <span>{s.label}</span>
                      <span className="text-slate-500">{s.time}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Rules</h2>
                <ul className="mt-2 space-y-2">
                  {(rules.length ? rules : ["Self-parking only — never hand over your keys"]).map((r) => (
                    <li key={r} className="flex items-start gap-2 text-sm text-slate-600">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                      {r}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-3.5 text-sm text-brand-900">
                  <p className="flex items-center gap-2 font-semibold">
                    <KeyRound className="size-4" aria-hidden />
                    Never hand over your vehicle keys.
                  </p>
                  <p className="mt-1 text-brand-800">
                    Self-parking only. Your keys never leave your hand. Report any host who asks for your keys.
                  </p>
                  {space.overnightAllowed === false && (
                    <p className="mt-1 text-xs text-brand-800">Overnight parking is not allowed.</p>
                  )}
                  {space.vehicleSizeNotes && (
                    <p className="mt-1 text-xs text-brand-800">Size: {space.vehicleSizeNotes}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Host */}
            {host && (
              <section
                aria-labelledby="host-heading"
                className="glass flex items-center justify-between gap-4 rounded-2xl p-5"
              >
                <div className="flex items-center gap-4">
                  <Avatar name={host.name} image={host.image} size={48} />
                  <div>
                    <h2 id="host-heading" className="text-[15px] font-semibold text-slate-900">
                      Hosted by {host.name ?? "a Parkly host"}
                    </h2>
                    <p className="text-sm text-slate-500">
                      Host since{" "}
                      {new Date(host.createdAt).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                    </p>
                  </div>
                </div>
                {host.hostVerified && (
                  <Badge variant="brand">
                    <BadgeCheck className="size-3.5" aria-hidden />
                    Verified host
                  </Badge>
                )}
              </section>
            )}

            {/* Reviews */}
            <section aria-labelledby="reviews-heading">
              <div className="flex items-center justify-between">
                <h2 id="reviews-heading" className="text-lg font-semibold text-slate-900">
                  Reviews
                </h2>
                <Rating value={space.ratingAvg} count={space.ratingCount} size={16} />
              </div>
              {reviews.length === 0 ? (
                <p className="glass-soft mt-3 rounded-2xl p-6 text-center text-sm text-slate-500">
                  No reviews yet. Reviews can only be left by drivers who completed a booking here.
                </p>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  {reviews.map((r) => (
                    <ReviewCard key={r.id} review={r} />
                  ))}
                </div>
              )}
            </section>

            <div className="flex items-center justify-between border-t border-slate-200 pt-5">
              <ReportDialog spaceId={space.id} loggedIn={!!user} />
              <Link href="/search" className="text-sm font-medium text-brand-700 hover:text-brand-800">
                ← Back to search
              </Link>
            </div>
          </div>

          {/* Right column: booking widget */}
          <aside className="lg:sticky lg:top-24 lg:h-fit">
            {space.status === "ACTIVE" || space.status === "VERIFIED" ? (
              <BookingWidget
                spaceId={space.id}
                pricePerHour={space.pricePerHour}
                minDurationMins={space.minDurationMins}
                maxDurationMins={space.maxDurationMins}
                vehicleTypes={vehicles}
                loggedIn={!!user}
                isOwner={isOwner}
                initialStart={sp.get("start") ?? undefined}
                initialDurationMins={sp.get("durationMins") ? Number(sp.get("durationMins")) : undefined}
              />
            ) : (
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50/80 p-5 text-sm text-amber-900 backdrop-blur-md">
                This listing is not accepting bookings right now.
              </div>
            )}
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}

function fmtMin(m: number) {
  const h = Math.floor(m / 60) % 24;
  const mm = m % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${mm ? `:${String(mm).padStart(2, "0")}` : ""} ${ampm}`;
}
