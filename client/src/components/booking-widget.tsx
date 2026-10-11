import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, KeyRound } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { Button } from "./ui/button";
import { Label, Select, Input, FieldError } from "./ui/input";
import { PriceBreakdown } from "./price-breakdown";
import { ALLOWED_DURATIONS_MINS, SERVICE_FEE_PCT, FREE_CANCEL_BEFORE_MINS } from "@/lib/constants";
import {
  formatDuration, formatINR, formatTime, nextHalfHour, toDateInputValue, toTimeInputValue,
} from "@/lib/utils";

interface Props {
  spaceId: string;
  pricePerHour: number; // paise
  minDurationMins: number;
  maxDurationMins: number;
  vehicleTypes: string[];
  loggedIn: boolean;
  isOwner: boolean;
  initialStart?: string; // ISO
  initialDurationMins?: number;
}

export function BookingWidget({
  spaceId,
  pricePerHour,
  minDurationMins,
  maxDurationMins,
  vehicleTypes,
  loggedIn,
  isOwner,
  initialStart,
  initialDurationMins,
}: Props) {
  const navigate = useNavigate();
  // Guard against malformed ?start= values from the URL.
  const parsedStart = initialStart ? new Date(initialStart) : null;
  const defaultStart =
    parsedStart && !Number.isNaN(parsedStart.getTime()) ? parsedStart : nextHalfHour();
  const durations = ALLOWED_DURATIONS_MINS.filter(
    (d) => d >= minDurationMins && d <= maxDurationMins
  );
  const [date, setDate] = React.useState(toDateInputValue(defaultStart));
  const [time, setTime] = React.useState(toTimeInputValue(defaultStart));
  const [duration, setDuration] = React.useState(
    initialDurationMins && durations.includes(initialDurationMins as never)
      ? initialDurationMins
      : durations[0] ?? 60
  );
  const [vehicleType, setVehicleType] = React.useState(vehicleTypes[0] ?? "CAR");
  const [plate, setPlate] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Display-only estimate; the server recomputes authoritative amounts.
  const estimateBase = Math.round((pricePerHour * duration) / 60);
  const estimateFee = Math.round((estimateBase * SERVICE_FEE_PCT) / 100);
  const [quote, setQuote] = React.useState<{
    parkingFee: number;
    platformFee: number;
    total: number;
    available: boolean;
    message: string | null;
  } | null>(null);

  const start = new Date(`${date}T${time}`);
  const end = new Date(start.getTime() + duration * 60000);
  const baseAmount = quote?.parkingFee ?? estimateBase;
  const serviceFee = quote?.platformFee ?? estimateFee;
  const totalAmount = quote?.total ?? estimateBase + estimateFee;

  React.useEffect(() => {
    if (Number.isNaN(start.getTime())) return;
    const t = window.setTimeout(() => {
      api
        .get(`/parking/${spaceId}/quote`, {
          params: { start: start.toISOString(), durationMins: duration },
        })
        .then(({ data }) => {
          const d = data.data as {
            available: boolean;
            message: string | null;
            quote: { parkingFee: number; platformFee: number; total: number };
          };
          setQuote({
            parkingFee: d.quote.parkingFee,
            platformFee: d.quote.platformFee,
            total: d.quote.total,
            available: d.available,
            message: d.message,
          });
          setError(d.available ? null : d.message);
        })
        .catch(() => setQuote(null));
    }, 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spaceId, date, time, duration]);

  async function reserve() {
    if (!loggedIn) {
      navigate(`/login?next=/parking/${spaceId}`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const { data } = await api.post("/bookings", {
        spaceId,
        start: start.toISOString(),
        durationMins: duration,
        vehicleType,
        vehiclePlate: plate,
      });
      const bookingId = data.data.bookingId as string;
      navigate(`/bookings/${bookingId}?new=1`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (isOwner) {
    return (
      <div className="glass-soft rounded-2xl p-5 text-sm text-slate-500">
        This is your listing. Manage it from your{" "}
        <a href="/host/listings" className="font-medium text-brand-700 underline">
          host dashboard
        </a>
        .
      </div>
    );
  }

  return (
    <div className="glass-strong rounded-2xl p-5">
      <p className="flex items-baseline gap-1">
        <span className="font-display text-2xl font-bold text-slate-900">
          {formatINR(pricePerHour)}
        </span>
        <span className="text-sm text-slate-500">/hour</span>
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="bk-date">Date</Label>
          <Input
            id="bk-date"
            type="date"
            value={date}
            min={toDateInputValue(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="bk-time">Start time</Label>
          <Input id="bk-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="col-span-2">
          <Label htmlFor="bk-duration">Duration</Label>
          <Select
            id="bk-duration"
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {durations.map((d) => (
              <option key={d} value={d}>
                {formatDuration(d)}
              </option>
            ))}
          </Select>
          <p className="mt-1.5 text-xs text-slate-400">
            Ends {formatTime(end)}
            {end.getDate() !== start.getDate() ? " (next day)" : ""}
          </p>
        </div>
        {vehicleTypes.length > 1 && (
          <div>
            <Label htmlFor="bk-vehicle">Vehicle</Label>
            <Select
              id="bk-vehicle"
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value)}
            >
              {vehicleTypes.map((v) => (
                <option key={v} value={v}>
                  {v === "CAR" ? "Car" : "Bike / scooter"}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className={vehicleTypes.length > 1 ? "" : "col-span-2"}>
          <Label htmlFor="bk-plate" hint="(optional)">
            Plate no.
          </Label>
          <Input
            id="bk-plate"
            value={plate}
            onChange={(e) => setPlate(e.target.value.toUpperCase())}
            placeholder="MH02AB1234"
            maxLength={15}
          />
        </div>
      </div>

      <div className="glass-soft mt-5 rounded-xl p-4">
        <PriceBreakdown
          pricePerHour={pricePerHour}
          durationMins={duration}
          baseAmount={baseAmount}
          serviceFee={serviceFee}
          totalAmount={totalAmount}
        />
      </div>

      <FieldError error={error ?? undefined} />

      <Button
        size="lg"
        className="mt-4 w-full"
        onClick={reserve}
        loading={busy}
        disabled={quote?.available === false}
      >
        {loggedIn ? "Reserve this spot" : "Log in to reserve"}
      </Button>
      <p className="mt-2 text-center text-xs text-slate-400">
        You&apos;ll pay on the next step. The reservation stays pending until payment is verified.
      </p>

      <ul className="mt-4 space-y-1.5 text-xs text-slate-500">
        <li className="flex items-center gap-1.5">
          <ShieldCheck className="size-3.5 text-brand-600" aria-hidden />
          Free cancellation until {FREE_CANCEL_BEFORE_MINS} min before start
        </li>
        <li className="flex items-center gap-1.5">
          <KeyRound className="size-3.5 text-brand-600" aria-hidden />
          Self-parking only — keys stay with you
        </li>
      </ul>
    </div>
  );
}
