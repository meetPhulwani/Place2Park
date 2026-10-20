import * as React from "react";
import Link from "@/components/link";
import { useParams, useSearchParams } from "react-router-dom";
import {
  CheckCircle2, ExternalLink, KeyRound, LifeBuoy, MapPin, ShieldCheck,
} from "lucide-react";
import { api, errorStatus } from "@/services/api";
import type { Booking, BookingSpaceRef, Payment, Review } from "@/types";
import { MapView } from "@/components/map/map-view";
import { BookingStatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PriceBreakdown } from "@/components/price-breakdown";
import { CancelBookingButton } from "@/components/cancel-booking-button";
import { PayNowButton } from "@/components/pay-now-button";
import { ReviewDialog } from "@/components/review-dialog";
import { gmapsDirectionsUrl } from "@/lib/geo";
import { FREE_CANCEL_BEFORE_MINS } from "@/lib/constants";
import { getDisplayLocation } from "@/lib/location";
import { formatDate, formatDuration, formatINR, formatTime } from "@/lib/utils";
import NotFoundPage from "@/pages/not-found";

interface DetailData {
  booking: Booking;
  payment: Payment | null;
  review: Review | null;
  isOwner: boolean;
  revealExactLocation?: boolean;
}

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [sp] = useSearchParams();
  const [data, setData] = React.useState<DetailData | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    document.title = "Booking details · Parkly";
    let cancelled = false;
    api
      .get(`/bookings/${id}`)
      .then(({ data: d }) => !cancelled && setData(d.data))
      .catch((e) => {
        if (cancelled) return;
        if ([403, 404].includes(errorStatus(e) ?? 0)) setNotFound(true);
        else setLoadError("Couldn't load this booking. Check your connection and try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadKey]);

  if (notFound) return <NotFoundPage />;
  if (loadError) {
    return (
      <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {loadError}
      </p>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-9 w-72" />
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      </div>
    );
  }

  const { booking, payment, review, revealExactLocation } = data;
  const space = booking.spaceId as BookingSpaceRef;
  const host = booking.hostId as { name?: string };
  const rules = space.rules ?? [];
  const start = new Date(booking.start);
  const cancellable =
    ["PENDING", "CONFIRMED"].includes(booking.status) && start.getTime() > Date.now();
  const paid = payment?.status === "PAID";
  const refundable = paid && start.getTime() - Date.now() >= FREE_CANCEL_BEFORE_MINS * 60000;
  const showAccess = ["CONFIRMED", "ACTIVE"].includes(booking.status);
  const reveal = revealExactLocation ?? showAccess;
  const displayLocation = getDisplayLocation(space);

  const paymentLabel: Record<string, string> = {
    CREATED: "PAYMENT_PENDING",
    PAID: "PAYMENT_PAID",
    FAILED: "Failed",
    REFUNDED: "Refunded",
    PAYMENT_PENDING: "PAYMENT_PENDING",
    PAYMENT_PAID: "PAYMENT_PAID",
  };
  const paymentStatusText =
    payment?.status === "REFUNDED" || payment?.refundStatus === "PROCESSED"
      ? "Refunded"
      : payment?.refundStatus === "PENDING"
        ? "Refund in progress"
        : payment?.refundStatus === "FAILED"
          ? "Refund unsuccessful"
          : paymentLabel[payment?.status ?? "CREATED"];

  return (
    <div className="mx-auto max-w-4xl animate-fade-in">
      {sp.get("new") === "1" && (
        <div
          role="status"
          className={`mb-6 flex items-center gap-3 rounded-2xl p-4 animate-slide-up ${
            booking.status === "PENDING"
              ? "border border-amber-200 bg-amber-50"
              : "border border-emerald-200 bg-emerald-50"
          }`}
        >
          <CheckCircle2
            className={`size-6 shrink-0 ${booking.status === "PENDING" ? "text-amber-600" : "text-emerald-600"}`}
            aria-hidden
          />
          <div>
            <p className={`font-semibold ${booking.status === "PENDING" ? "text-amber-900" : "text-emerald-900"}`}>
              {booking.status === "PENDING" ? "Reservation held — payment pending" : "Your spot is booked!"}
            </p>
            <p className={`text-sm ${booking.status === "PENDING" ? "text-amber-800" : "text-emerald-700"}`}>
              {booking.status === "PENDING"
                ? "Pay now to confirm. The exact address is shared after payment is verified."
                : "Save your access code below — you'll need it at the gate."}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">Booking {booking.code}</p>
          <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-slate-900">
            {space.title}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
            <MapPin className="size-4" aria-hidden />
            {reveal && space.address && space.address !== displayLocation
              ? space.address
              : displayLocation}
          </p>
        </div>
        <BookingStatusBadge status={booking.status} />
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        {/* Schedule + access */}
        <Card>
          <CardHeader>
            <CardTitle>Your reservation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="font-medium text-slate-900">{formatDate(booking.start)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Duration</dt>
                <dd className="font-medium text-slate-900">{formatDuration(booking.durationMins)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">From</dt>
                <dd className="font-medium text-slate-900">{formatTime(booking.start)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Until</dt>
                <dd className="font-medium text-slate-900">{formatTime(booking.end)}</dd>
              </div>
              {booking.vehiclePlate && (
                <div>
                  <dt className="text-slate-500">Vehicle</dt>
                  <dd className="font-medium text-slate-900">{booking.vehiclePlate}</dd>
                </div>
              )}
              <div>
                <dt className="text-slate-500">Host</dt>
                <dd className="font-medium text-slate-900">{host?.name ?? "Parkly host"}</dd>
              </div>
            </dl>
            {showAccess && (
              <div className="rounded-xl border border-brand-200 bg-brand-50 p-4 text-center">
                <p className="text-xs font-medium uppercase tracking-wider text-brand-700">
                  Access code — show at the gate
                </p>
                <p
                  className="mt-1 font-display text-3xl font-bold tracking-[0.3em] text-brand-900"
                  aria-label={`Access code ${booking.accessCode.split("").join(" ")}`}
                >
                  {booking.accessCode}
                </p>
              </div>
            )}
            {reveal ? (
              <a
                href={gmapsDirectionsUrl(space.latitude ?? 0, space.longitude ?? 0)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-800"
              >
                <ExternalLink className="size-4" aria-hidden />
                Navigate to parking
              </a>
            ) : (
              <p className="text-xs text-slate-400">
                Navigation and the exact entrance are shared after the booking is confirmed.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Payment */}
        <Card>
          <CardHeader>
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PriceBreakdown
              durationMins={booking.durationMins}
              baseAmount={booking.baseAmount}
              serviceFee={booking.serviceFee}
              totalAmount={booking.totalAmount}
            />
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <span className="text-slate-500">
                Status
                {payment?.provider === "MOCK" && (
                  <Badge variant="outline" className="ml-2">Mock payment (dev)</Badge>
                )}
              </span>
              <span className="font-semibold text-slate-900">
                {paymentStatusText}
              </span>
            </div>
            {payment?.paymentId && (
              <p className="text-xs text-slate-400">Payment ID: {payment.paymentId}</p>
            )}
            {data.isOwner && booking.status === "PENDING" && !paid && (
              <PayNowButton
                bookingId={booking.id}
                bookingCode={booking.code}
                onPaid={() => setReloadKey((k) => k + 1)}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Map */}
      <div className="mt-6 h-56 overflow-hidden rounded-2xl border border-slate-200">
        <MapView
          markers={[
            {
              id: space.id,
              lat: space.latitude ?? 0,
              lng: space.longitude ?? 0,
              label: booking.code,
              title: space.title,
            },
          ]}
          selectedId={space.id}
          className="h-full w-full"
        />
      </div>

      {/* Access instructions + rules */}
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Access instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {reveal
                ? space.accessInstructions || "Show your booking code at the entrance."
                : "Access instructions are shared after the booking is confirmed."}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Parking rules</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {(rules.length ? rules : ["Self-parking only"]).map((r) => (
                <li key={r} className="flex items-start gap-2 text-sm text-slate-600">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden />
                  {r}
                </li>
              ))}
            </ul>
            <p className="mt-4 flex items-center gap-1.5 text-xs font-medium text-brand-700">
              <KeyRound className="size-3.5" aria-hidden />
              Your keys stay with you.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="glass mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <LifeBuoy className="size-4" aria-hidden />
          Need help?{" "}
          <Link href="/support" className="font-medium text-brand-700 hover:text-brand-800">
            Contact support
          </Link>
        </div>
        <div className="flex items-center gap-3">
          {booking.status === "COMPLETED" && !review && (
            <ReviewDialog
              bookingId={booking.id}
              spaceTitle={space.title}
              triggerVariant="primary"
              onReviewed={() => setReloadKey((k) => k + 1)}
            />
          )}
          {review && (
            <span className="text-sm text-slate-500">You rated this {review.rating}/5 ★</span>
          )}
          {cancellable && (
            <CancelBookingButton
              bookingId={booking.id}
              refundable={refundable}
              onCancelled={() => setReloadKey((k) => k + 1)}
            />
          )}
        </div>
      </div>

      {cancellable && (
        <p className="mt-3 text-xs text-slate-400">
          Cancellation policy: full refund if cancelled at least {FREE_CANCEL_BEFORE_MINS} minutes
          before the start time. Later cancellations are non-refundable.
        </p>
      )}
    </div>
  );
}
