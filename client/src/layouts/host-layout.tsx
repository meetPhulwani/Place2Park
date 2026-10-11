import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { DashboardSidebar, type SidebarItem } from "@/components/dashboard-sidebar";
import { GuardGate } from "./guards";

const items: SidebarItem[] = [
  { href: "/host", label: "Overview", icon: "LayoutDashboard", exact: true },
  { href: "/host/listings", label: "Listings", icon: "Building2" },
  { href: "/host/calendar", label: "Calendar", icon: "CalendarDays" },
  { href: "/host/bookings", label: "Bookings", icon: "CalendarClock" },
  { href: "/host/earnings", label: "Earnings", icon: "Wallet" },
  { href: "/host/reviews", label: "Reviews", icon: "Star" },
  { href: "/host/settings", label: "Settings", icon: "Settings" },
];

export function HostLayout() {
  return (
    <GuardGate requirement="host">
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
          <DashboardSidebar items={items} title="Host navigation" />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </GuardGate>
  );
}
