import Link from "@/components/link";
import Image from "@/components/image";
import { BadgeCheck, Zap, Cctv, Car, Bike, MapPin, Shield } from "lucide-react";
import type { SpaceSummary } from "@/types";
import { straightLineLabel } from "@/lib/destination";
import { formatINR, cn } from "@/lib/utils";
import { getDisplayLocation } from "@/lib/location";
import { Rating } from "./ui/rating";
import { Badge } from "./ui/badge";
import { LEVEL_LABELS, PROPERTY_TYPE_LABELS, type Level, type PropertyType } from "@/lib/constants";

export function ParkingCard({
  space,
  selected,
  onHover,
  bookingParams,
}: {
  space: SpaceSummary;
  selected?: boolean;
  onHover?: (id: string | null) => void;
  bookingParams?: string;
}) {
  const href = `/parking/${space.id}${bookingParams ? `?${bookingParams}` : ""}`;
  const vehicles = space.vehicleTypes.split(",").map((v) => v.trim());
  const location = space.displayLocation || getDisplayLocation(space);
  const distance = straightLineLabel(space.distanceKm);
  const property = PROPERTY_TYPE_LABELS[space.propertyType as PropertyType] ?? space.propertyType;
  const level = LEVEL_LABELS[space.level as Level] ?? space.level;
  const photos = space.images?.filter((image) => image.url) ?? [];
  const imageUrl = photos[0]?.url ?? space.imageUrl;

  return (
    <Link
      href={href}
      onMouseEnter={() => onHover?.(space.id)}
      onMouseLeave={() => onHover?.(null)}
      onPointerDown={() => onHover?.(space.id)}
      className={cn(
        "group flex min-h-[156px] overflow-hidden rounded-xl border border-line bg-white shadow-card transition-[border-color,box-shadow] duration-200 sm:min-h-[164px]",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:border-volt [@media(hover:hover)_and_(pointer:fine)]:hover:shadow-card-hover",
        selected && "border-volt ring-2 ring-volt/70"
      )}
      data-space-id={space.id}
    >
      <div className="flex w-[44%] shrink-0 items-center self-center p-1 sm:w-[45%] sm:p-1.5">
        <div className="relative aspect-[3/2] w-full max-h-[156px] overflow-hidden rounded-lg bg-page">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(max-width: 640px) 42vw, 240px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-mist">
            <Car className="size-8" aria-hidden />
          </div>
        )}
        {photos.length > 1 && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-ink/75 px-1.5 py-0.5 text-[10px] font-medium text-white">
            {photos.length} photos
          </span>
        )}
        <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-col items-start gap-1">
          {space.verified && (
            <Badge variant="brand" className="px-1.5 py-0 text-[10px]">
              <BadgeCheck className="size-3" aria-hidden />
              Verified
            </Badge>
          )}
          {space.available === false && (
            <Badge variant="danger" className="px-1.5 py-0 text-[10px]" title="Unavailable for this time">
              Unavailable
            </Badge>
          )}
          {space.available === true && (
            <Badge variant="volt" className="px-1.5 py-0 text-[10px]">
              Available
            </Badge>
          )}
        </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5 px-3 py-2.5">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">{space.title}</h3>
            <p className="shrink-0 text-sm font-semibold text-brand-500">
              {formatINR(space.pricePerHour)}
              <span className="text-[11px] font-medium text-brand-500/80">/hr</span>
            </p>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted">
            <MapPin className="size-3 shrink-0 text-brand-500" aria-hidden />
            <span className="line-clamp-1">
              {location}
              {distance && (
                <>
                  {" · "}
                  <span title="Straight-line distance, not a driving route">{distance}</span>
                </>
              )}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink">
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            {space.covered ? "Covered" : "Open"}
          </Badge>
          {space.cctv && (
            <span className="inline-flex items-center gap-0.5">
              <Cctv className="size-3.5 text-brand-500" aria-hidden />
              CCTV
            </span>
          )}
          {space.evCharging && (
            <span className="inline-flex items-center gap-0.5">
              <Zap className="size-3.5 text-brand-500" aria-hidden />
              EV
            </span>
          )}
          {space.securityGuard && (
            <span className="inline-flex items-center gap-0.5">
              <Shield className="size-3.5 text-brand-500" aria-hidden />
              Guard
            </span>
          )}
          {vehicles.includes("CAR") && <Car className="size-3.5 text-brand-500" aria-label="Cars allowed" />}
          {vehicles.includes("BIKE") && <Bike className="size-3.5 text-brand-500" aria-label="Bikes allowed" />}
          <Rating value={space.ratingAvg} count={space.ratingCount} size={12} />
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="line-clamp-1 text-[11px] text-muted">
            {property} · {level}
          </p>
          <span className="shrink-0 text-xs font-semibold text-brand-500">View details</span>
        </div>
      </div>
    </Link>
  );
}
