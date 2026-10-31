import type { LucideIcon } from "lucide-react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

export type QuickAction = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export function QuickActions({
  items,
  className,
}: {
  items: QuickAction[];
  className?: string;
}) {
  return (
    <nav aria-label="Quick actions" className={cn("grid grid-cols-2 gap-3 sm:grid-cols-4", className)}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3 shadow-card transition-colors duration-200 hover:border-brand-400 hover:bg-brand-50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50">
            <item.icon className="size-4 text-brand-500" aria-hidden />
          </span>
          <span className="text-sm font-medium text-ink">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
