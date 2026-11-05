import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { consoleApi } from "@/services/console-api";

const links = [
  ["/", "Overview"],
  ["/users", "Users"],
  ["/listings", "Listings"],
  ["/bookings", "Bookings"],
  ["/payments", "Payments"],
  ["/payouts", "Payouts"],
  ["/reports", "Reports"],
  ["/support", "Support"],
  ["/faqs", "FAQs"],
  ["/reviews", "Reviews"],
  ["/staff", "Administrators"],
  ["/audits", "Audit log"],
  ["/settings", "Configuration"],
  ["/security", "Security"],
] as const;

export function ConsoleShell() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F3F5F7] text-[#111827]">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-[#C7D1DD] bg-white p-4 md:block">
          <p className="px-2 text-sm font-semibold text-[#0251B0]">Place2Park Console</p>
          <nav className="mt-4 space-y-1">
            {links.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-[#0251B0] text-white" : "text-[#111827] hover:bg-[#F3F5F7]"}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <button
            type="button"
            className="mt-6 w-full rounded-lg px-3 py-2 text-left text-sm text-[#111827] hover:bg-[#F3F5F7]"
            onClick={() => {
              void consoleApi.post("/auth/logout").finally(() => navigate("/sign-in"));
            }}
          >
            Sign out
          </button>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
