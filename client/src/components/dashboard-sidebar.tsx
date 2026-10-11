import Link from "@/components/link";
import { useLocation } from "react-router-dom";
import {
  LayoutDashboard, Search, CalendarClock, History, Heart, CreditCard, User,
  Building2, CalendarDays, Wallet, Star, Settings, Users, Flag,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icon components can't cross the server->client boundary as props,
// so items reference icons by name and we resolve them here.
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
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block" aria-label={title}>
        <nav className="glass sticky top-24 space-y-1 rounded-2xl p-2">
          {items.map((it) => {
            const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
            const Icon = ICONS[it.icon];
            return (
              <Link
                key={it.href}
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "glass-chip text-brand-800"
                    : "text-slate-600 hover:bg-white/45 hover:text-slate-900"
                )}
              >
                <Icon className={cn("size-4.5", active ? "text-brand-700" : "text-slate-400")} aria-hidden />
                {it.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      {/* Mobile horizontal nav */}
      <nav
        aria-label={title}
        className="scrollbar-thin -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-3 lg:hidden"
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
                "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                active ? "bg-brand-700 text-white" : "glass-chip text-slate-600"
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
