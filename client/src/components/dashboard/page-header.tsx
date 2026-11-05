import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardHeader({
  title,
  description,
  actions,
  className,
  kicker,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  kicker?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        {kicker && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-500">{kicker}</p>}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
