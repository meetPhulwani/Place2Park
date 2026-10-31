import * as React from "react";
import { useParams } from "react-router-dom";
import { api, errorStatus } from "@/services/api";
import type { ParkingSpaceFull } from "@/types";
import { ListingWizard, type WizardData, defaultWizardData } from "@/components/listing-wizard";
import { Skeleton } from "@/components/ui/skeleton";
import NotFoundPage from "@/pages/not-found";

function minutesToTime(m: number) {
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

type Listing = ParkingSpaceFull & {
  availability?: { dayOfWeek: number; startMinute: number; endMinute: number }[];
};

export default function EditListingPage() {
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = React.useState<Listing | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  React.useEffect(() => {
    document.title = "Edit listing · Place2Park";
    api
      .get(`/host/listings/${id}`)
      .then(({ data }) => setListing(data.data.listing))
      .catch((e) => {
        if ([403, 404].includes(errorStatus(e) ?? 0)) setNotFound(true);
      });
  }, [id]);

  if (notFound) return <NotFoundPage />;
  if (!listing) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-96 rounded-2xl" />
      </div>
    );
  }

  const base = defaultWizardData();
  const availability = listing.availability ?? [];
  const vehicleTypes = Array.isArray(listing.vehicleTypes)
    ? listing.vehicleTypes
    : String(listing.vehicleTypes ?? "CAR").split(",");
  const initial: WizardData = {
    ...base,
    title: listing.title,
    description: listing.description,
    propertyType: listing.propertyType,
    spaceType: listing.spaceType,
    covered: listing.covered,
    level: listing.level,
    vehicleTypes,
    evCharging: listing.evCharging,
    cctv: listing.cctv,
    securityGuard: listing.securityGuard,
    gated: listing.gated,
    lengthFt: listing.lengthFt ? String(listing.lengthFt) : "",
    widthFt: listing.widthFt ? String(listing.widthFt) : "",
    heightFt: listing.heightFt ? String(listing.heightFt) : "",
    address: listing.address,
    formattedAddress: listing.formattedAddress ?? listing.address,
    locality: listing.locality ?? listing.city,
    sublocality: listing.sublocality ?? "",
    area: listing.area,
    city: listing.city,
    district: listing.district ?? "",
    state: listing.state,
    pincode: listing.pincode ?? listing.postalCode ?? "",
    postalCode: listing.postalCode ?? listing.pincode ?? "",
    latitude: String(listing.latitude),
    longitude: String(listing.longitude),
    placeId: listing.placeId ?? "",
    accessInstructions: listing.accessInstructions,
    vehicleSizeNotes: listing.vehicleSizeNotes ?? "",
    overnightAllowed: listing.overnightAllowed ?? false,
    selfParkingConfirmed: listing.selfParkingConfirmed ?? listing.rules?.includes("Self-parking only — never hand over your keys") ?? false,
    blockedDates: listing.blockedDates ?? [],
    rules: listing.rules ?? [],
    priceRupees: String(Math.round(listing.pricePerHour / 100)),
    minDurationMins: listing.minDurationMins,
    maxDurationMins: listing.maxDurationMins,
    images: listing.images.map((i) => ({
      url: i.url,
      alt: i.alt ?? "",
      ...(i.publicId ? { publicId: i.publicId } : {}),
    })),
    open247: availability.length === 0,
    days: base.days.map((d) => {
      const rule = availability.find((a) => a.dayOfWeek === d.day);
      return rule
        ? {
            day: d.day,
            enabled: true,
            start: minutesToTime(rule.startMinute),
            end: minutesToTime(rule.endMinute === 1440 ? 0 : rule.endMinute),
          }
        : { ...d, enabled: false };
    }),
  };

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight text-slate-900">
        Edit listing
      </h1>
      <ListingWizard initial={initial} spaceId={listing.id} initialStatus={listing.status} />
    </div>
  );
}
