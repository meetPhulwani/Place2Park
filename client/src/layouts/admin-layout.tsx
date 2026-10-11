import { Outlet } from "react-router-dom";
import { Navbar } from "@/components/navbar";
import { DashboardSidebar, type SidebarItem } from "@/components/dashboard-sidebar";
import { Badge } from "@/components/ui/badge";
import { GuardGate } from "./guards";

const items: SidebarItem[] = [
  { href: "/admin", label: "Dashboard", icon: "LayoutDashboard", exact: true },
  { href: "/admin/users", label: "Users", icon: "Users" },
  { href: "/admin/listings", label: "Listings", icon: "Building2" },
  { href: "/admin/bookings", label: "Bookings", icon: "CalendarClock" },
  { href: "/admin/payments", label: "Payments", icon: "CreditCard" },
  { href: "/admin/reports", label: "Reports", icon: "Flag" },
  { href: "/admin/reviews", label: "Reviews", icon: "Star" },
];

export function AdminLayout() {
  return (
    <GuardGate requirement="admin">
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          <Badge variant="danger" className="mb-4">Admin area</Badge>
          <div className="flex flex-col gap-2 lg:flex-row lg:gap-8">
            <DashboardSidebar items={items} title="Admin navigation" />
            <main className="min-w-0 flex-1">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </GuardGate>
  );
}
