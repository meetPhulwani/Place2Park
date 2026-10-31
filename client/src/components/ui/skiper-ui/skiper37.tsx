/**
 * Skiper 37 AnimatedNumber — React + Number Flow + Framer Motion
 * Design inspired by https://number-flow.barvian.me/
 * License: free to use in personal and commercial projects.
 * Attribution to Skiper UI is required for the free version.
 * https://skiper-ui.com/v1/skiper37
 *
 * Author: @gurvinder-singh02 — https://gxuri.me
 */
import * as React from "react";
import NumberFlow from "@number-flow/react";
import { useInView } from "react-intersection-observer";
import { cn, formatINR } from "@/lib/utils";

export type AnimatedNumberFormat = "integer" | "currency-paise" | "percent";

function announcedValue(value: number, format: AnimatedNumberFormat) {
  if (format === "currency-paise") return formatINR(value);
  if (format === "percent") return `${Math.round(value)}%`;
  return new Intl.NumberFormat("en-IN").format(value);
}

export function AnimatedNumber({
  value,
  format = "integer",
  className,
}: {
  value: number;
  format?: AnimatedNumberFormat;
  className?: string;
}) {
  const { ref, inView } = useInView({ triggerOnce: true, threshold: 0 });
  const amount = Number.isFinite(value) ? value : 0;
  const [shown, setShown] = React.useState(0);
  const started = React.useRef(false);

  React.useEffect(() => {
    if (!inView && !started.current) return;
    started.current = true;
    setShown(amount);
  }, [inView, amount]);

  const display = format === "integer" ? shown : shown / 100;

  return (
    <span ref={ref} className={cn("inline-block min-h-[1em] tabular-nums", className)}>
      <span className="sr-only">{announcedValue(amount, format)}</span>
      <span aria-hidden="true">
        {format === "currency-paise" ? (
          <NumberFlow
            isolate
            value={display}
            locales="en-IN"
            format={{ style: "currency", currency: "INR", maximumFractionDigits: 0 }}
          />
        ) : format === "percent" ? (
          <NumberFlow
            isolate
            value={display}
            locales="en-IN"
            format={{ style: "percent", maximumFractionDigits: 0 }}
          />
        ) : (
          <NumberFlow isolate value={display} locales="en-IN" />
        )}
      </span>
    </span>
  );
}

export const AnimatedNumber_004 = AnimatedNumber;
