import Link from "@/components/link";
import Image from "@/components/image";
import { ArrowRight, Clock, ExternalLink, MapPin } from "lucide-react";
import { BookingStatusBadge } from "./ui/badge";
import { gmapsDirectionsUrl } from "@/lib/geo";
import { getDisplayLocation } from "@/lib/location";
import { formatDate, formatDuration, formatINR, formatTime } from "@/lib/utils";

interface SpaceRef {
  title?: string;
  area?: string;
  city?: string;
  locality?: string;
  sublocality?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  images?: { url: string; alt?: string; sortOrder?: number }[];
}

export interface BookingWithSpace {
  id: string;
  code: string;
  start: Date | string;
  end: Date | string;
  durationMins: number;
  totalAmount: number;
  status: string;
  /** The REST API populates the space under `spaceId`. */
  space?: SpaceRef;
  spaceId?: SpaceRef | string;
}

function spaceOf(b: BookingWithSpace): SpaceRef {
  if (b.space) return b.space;
  if (b.spaceId && typeof b.spaceId === "object") return b.spaceId;
  return { title: "Parking space", area: "", latitude: 0, longitude: 0, images: [] };
}

export function BookingCard({ booking }: { booking: BookingWithSpace }) {
  const space = spaceOf(booking);
  const img = space.images?.[0]?.url;
  return (
    <div className="glass flex gap-4 rounded-2xl p-4 transition-shadow hover:shadow-card-hover">
      <div className="relative hidden size-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:block">
        {img && <Image src={img} alt="" fill sizes="96px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="truncate text-[15px] font-semibold text-slate-900">{space.title}</h3>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
          <MapPin className="size-3.5" aria-hidden />
          {getDisplayLocation(space)}
        </p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
          <span className="font-medium">{formatDate(booking.start)}</span>
          <span className="inline-flex items-center gap-1 text-slate-500">
            <Clock className="size-3.5" aria-hidden />
            {formatTime(booking.start)} – {formatTime(booking.end)} ({formatDuration(booking.durationMins)})
          </span>
          <span className="font-semibold text-slate-900">{formatINR(booking.totalAmount)}</span>
        </p>
        <div className="mt-3 flex items-center gap-4">
          <Link
            href={`/bookings/${booking.id}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            Details <ArrowRight className="size-3.5" aria-hidden />
          </Link>
          {["CONFIRMED", "ACTIVE"].includes(booking.status) && (
            <a
              href={gmapsDirectionsUrl(space.latitude ?? 0, space.longitude ?? 0)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-800"
            >
              Navigate <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
