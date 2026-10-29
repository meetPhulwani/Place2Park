import type { LucideIcon } from "lucide-react";
import {
  CalendarClock, History, Star, Wallet, Building2, Users, CreditCard, Flag,
  IndianRupee, TrendingUp, CalendarDays, ShieldCheck, Percent,
} from "lucide-react";
import { Card } from "./ui/card";
import { cn } from "@/lib/utils";

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
  className,
}: {
  icon: StatIconName | LucideIcon;
  label: string;
  value: string | number;
  hint?: string;
  className?: string;
}) {
  const Icon: LucideIcon = typeof icon === "string" ? ICONS[icon] : icon;
  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
          <Icon className="size-4 text-brand-600" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}
