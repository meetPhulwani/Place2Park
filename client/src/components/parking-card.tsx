import Link from "@/components/link";
import Image from "@/components/image";
import { BadgeCheck, Zap, Umbrella, Cctv, Car, Bike, MapPin } from "lucide-react";
import type { SpaceSummary } from "@/types";
import { formatINR, walkingMins, cn } from "@/lib/utils";
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
  const vehicles = space.vehicleTypes.split(",");

  return (
    <Link
      href={href}
      onMouseEnter={() => onHover?.(space.id)}
      onMouseLeave={() => onHover?.(null)}
      className={cn(
        "group glass block overflow-hidden rounded-2xl transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-card-hover",
        selected && "ring-2 ring-brand-500/45 shadow-card-hover"
      )}
      data-space-id={space.id}
    >
      <div className="relative h-40 overflow-hidden bg-slate-100/70">
        {space.imageUrl ? (
          <Image
            src={space.imageUrl}
            alt={space.title}
            fill
            sizes="(max-width: 640px) 100vw, 400px"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-300">
            <Car className="size-10" aria-hidden />
          </div>
        )}
        <div className="absolute left-3 top-3 flex gap-1.5">
          {space.verified && (
            <Badge variant="brand" className="bg-white/80 backdrop-blur-md">
              <BadgeCheck className="size-3" aria-hidden />
              Verified
            </Badge>
          )}
          {space.available === false && (
            <Badge variant="danger">Unavailable for this slot</Badge>
          )}
        </div>
        <div className="glass-dark absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-sm font-semibold">
          {formatINR(space.pricePerHour)}
          <span className="text-xs font-normal text-slate-300">/hr</span>
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-[15px] font-semibold text-slate-900">{space.title}</h3>
        </div>
        <p className="mt-0.5 flex items-center gap-1.5 text-sm text-slate-500">
          <MapPin className="size-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="line-clamp-1">
            {space.displayLocation || getDisplayLocation(space)}
            {space.distanceKm != null && (
              <>
                {" · "}
                {walkingMins(space.distanceKm)} min walk
              </>
            )}
          </span>
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-slate-400">
            {space.covered && <Umbrella className="size-4" aria-label="Covered parking" />}
            {space.evCharging && <Zap className="size-4" aria-label="EV charging" />}
            {space.cctv && <Cctv className="size-4" aria-label="CCTV monitored" />}
            {vehicles.includes("CAR") && <Car className="size-4" aria-label="Cars allowed" />}
            {vehicles.includes("BIKE") && <Bike className="size-4" aria-label="Bikes allowed" />}
          </div>
          <Rating value={space.ratingAvg} count={space.ratingCount} />
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {PROPERTY_TYPE_LABELS[space.propertyType as PropertyType] ?? space.propertyType} ·{" "}
          {LEVEL_LABELS[space.level as Level] ?? space.level}
        </p>
      </div>
    </Link>
  );
}
