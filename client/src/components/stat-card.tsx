import type { LucideIcon } from "lucide-react";
import {
  CalendarClock, History, Star, Wallet, Building2, Users, CreditCard, Flag,
  IndianRupee, TrendingUp, CalendarDays, ShieldCheck, Percent,
} from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";
import { AnimatedNumber, type AnimatedNumberFormat } from "@/components/ui/skiper-ui/skiper37";

const ICONS = {
  CalendarClock, History, Star, Wallet, Building2, Users, CreditCard, Flag,
  IndianRupee, TrendingUp, CalendarDays, ShieldCheck, Percent,
} as const;

export type StatIconName = keyof typeof ICONS;

export function StatCard({
  icon,
  label,
  value,
  hint,
  highlight,
  format,
  className,
}: {
  icon: StatIconName | LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  highlight?: boolean;
  format?: AnimatedNumberFormat;
  className?: string;
}) {
  const Icon: LucideIcon = typeof icon === "string" ? ICONS[icon] : icon;
  const numeric = typeof value === "number" ? value : null;
  return (
    <Card
      className={cn(
        "flex h-full flex-col border-t-[3px] p-5 transition-shadow duration-200 hover:shadow-card-hover",
        highlight ? "border-t-volt" : "border-t-transparent",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="size-4 text-brand-500" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-brand-600">
        {numeric != null ? (
          <AnimatedNumber value={numeric} format={format ?? "integer"} />
        ) : (
          value
        )}
      </p>
      <p className="mt-1 min-h-4 text-xs text-muted">{hint ?? "\u00a0"}</p>
    </Card>
  );
}
