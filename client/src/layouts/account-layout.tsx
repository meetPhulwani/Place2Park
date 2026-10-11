import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { DashboardSidebar, type SidebarItem } from "@/components/dashboard-sidebar";
import { GuardGate } from "./guards";

const items: SidebarItem[] = [
  { href: "/dashboard", label: "Overview", icon: "LayoutDashboard", exact: true },
  { href: "/search", label: "Find Parking", icon: "Search" },
  { href: "/bookings", label: "Upcoming", icon: "CalendarClock" },
  { href: "/history", label: "History", icon: "History" },
  { href: "/saved", label: "Saved", icon: "Heart" },
  { href: "/payments", label: "Payments", icon: "CreditCard" },
  { href: "/profile", label: "Profile", icon: "User" },
];

export function AccountLayout() {
  return (
    <GuardGate>
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:px-6 lg:flex-row lg:gap-8 lg:py-8">
          <DashboardSidebar items={items} title="Account navigation" />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </GuardGate>
  );
}
