import { formatINR, formatDuration } from "@/lib/utils";
import { SERVICE_FEE_PCT } from "@/lib/constants";

export function PriceBreakdown({
  pricePerHour,
  durationMins,
  baseAmount,
  serviceFee,
  totalAmount,
}: {
  pricePerHour?: number;
  durationMins: number;
  baseAmount: number;
  serviceFee: number;
  totalAmount: number;
}) {
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between gap-3">
        <dt className="min-w-0 text-slate-500">
          {pricePerHour != null
            ? `${formatINR(pricePerHour)}/hr × ${formatDuration(durationMins)}`
            : `Parking (${formatDuration(durationMins)})`}
        </dt>
        <dd className="shrink-0 font-medium text-slate-800">{formatINR(baseAmount)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="min-w-0 text-slate-500">Platform fee ({SERVICE_FEE_PCT}%)</dt>
        <dd className="shrink-0 font-medium text-slate-800">{formatINR(serviceFee)}</dd>
      </div>
      <div className="flex justify-between gap-3 border-t border-slate-200 pt-2.5">
        <dt className="font-semibold text-ink">Total</dt>
        <dd className="shrink-0 font-semibold text-brand-600">{formatINR(totalAmount)}</dd>
      </div>
    </dl>
  );
}
