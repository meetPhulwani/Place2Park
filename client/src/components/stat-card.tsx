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
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="size-4.5 text-slate-300" aria-hidden />
      </div>
      <p className="mt-2 font-display text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Card>
  );
}
