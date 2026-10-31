import Link from "@/components/link";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard, Search, CalendarClock, History, Heart, CreditCard, User,
  Building2, CalendarDays, Wallet, Star, Settings, Users, Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  LayoutDashboard, Search, CalendarClock, History, Heart, CreditCard, User,
  Building2, CalendarDays, Wallet, Star, Settings, Users, Flag,
} as const;

export type SidebarIconName = keyof typeof ICONS;

export interface SidebarItem {
  href: string;
  label: string;
  icon: SidebarIconName;
  exact?: boolean;
}

export function DashboardSidebar({ items, title }: { items: SidebarItem[]; title: string }) {
  const { pathname } = useLocation();
  return (
    <>
      <aside className="hidden w-56 shrink-0 lg:block" aria-label={title}>
        <nav className="sticky top-20 space-y-1 rounded-xl border border-line bg-white p-2 shadow-card">
          {items.map((it) => {
            const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
            const Icon = ICONS[it.icon];
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-brand-50 text-brand-600"
                    : "text-muted hover:bg-mist-50 hover:text-ink"
                )}
              >
                <Icon className={cn("size-4", active ? "text-brand-500" : "text-slate-400")} aria-hidden />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <nav
        aria-label={title}
        className="scrollbar-thin -mx-4 mb-4 flex min-w-0 w-full gap-1.5 overflow-x-auto px-4 pb-2 lg:hidden"
      >
        {items.map((it) => {
          const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
          const Icon = ICONS[it.icon];
          return (
            <Link
              key={it.href}
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-200",
                active ? "bg-brand-500 text-white" : "border border-line bg-white text-muted"
              )}
            >
              <Icon className="size-3.5" aria-hidden />
              {it.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
