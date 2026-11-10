import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  BookOpen,
  Building2,
  CalendarClock,
  ChevronLeft,
  ClipboardList,
  CreditCard,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Settings,
  Shield,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { consoleApi } from "@/services/console-api";
import { SuperAdminPassword } from "./security";
import "./console.css";

const groups = [
  {
    label: "Overview",
    items: [["/", "Dashboard", LayoutDashboard]] as const,
  },
  {
    label: "Marketplace",
    items: [
      ["/users", "Users", Users],
      ["/listings", "Listings", Building2],
      ["/bookings", "Bookings", CalendarClock],
      ["/reviews", "Reviews", Star],
    ] as const,
  },
  {
    label: "Finance",
    items: [
      ["/payments", "Payments", CreditCard],
      ["/payouts", "Payouts", Wallet],
    ] as const,
  },
  {
    label: "Operations",
    items: [
      ["/reports", "Reports", Flag],
      ["/support", "Support", LifeBuoy],
      ["/faqs", "FAQs", BookOpen],
    ] as const,
  },
  {
    label: "System",
    items: [
      ["/staff", "Administrators", Shield],
      ["/audits", "Audit log", ClipboardList],
      ["/settings", "Configuration", Settings],
    ] as const,
  },
];

const titles: Record<string, string> = {
  "/": "Dashboard",
  "/users": "Users",
  "/listings": "Listings",
  "/bookings": "Bookings",
  "/payments": "Payments",
  "/payouts": "Payouts",
  "/reports": "Reports",
  "/support": "Support",
  "/faqs": "FAQs",
  "/reviews": "Reviews",
  "/staff": "Administrators",
  "/audits": "Audit log",
  "/settings": "Configuration",
};

function roleLabel(role: string) {
  if (role === "SUPER_ADMIN") return "Super Admin";
  if (role === "OPERATIONS") return "Operations";
  if (role === "SUPPORT") return "Support";
  if (role === "FINANCE") return "Finance";
  return role;
}

function pageTitle(pathname: string) {
  if (titles[pathname]) return titles[pathname];
  if (pathname.startsWith("/support/")) return "Support case";
  return "Admin Console";
}

export function ConsoleShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menu, setMenu] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [role, setRole] = useState("");
  const title = pageTitle(location.pathname);

  useEffect(() => {
    consoleApi.get("/auth/session").then(({ data }) => {
      const row = data.data.admin as { role?: string };
      setRole(String(row.role ?? ""));
    }).catch(() => setRole(""));
  }, []);

  function signOut() {
    void consoleApi.post("/auth/logout").finally(() => navigate("/sign-in"));
  }

  function navigation(compact: boolean) {
    return (
      <>
        {!compact && (
          <div className="px-3 pb-6">
            <p className="font-display text-lg font-bold leading-none tracking-tight">Place2Park</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#D1FF42]">Admin Console</p>
          </div>
        )}
        <nav className="min-h-0 flex-1 space-y-5 overflow-y-auto px-2 pb-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!compact && <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">{group.label}</p>}
              <div className="space-y-0.5">
                {group.items.map(([to, label, Icon]) => (
                  <NavLink
                    key={to}
                    to={to}
                    end={to === "/"}
                    title={label}
                    aria-label={label}
                    className="p2p-nav-link"
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {!compact && <span>{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className={`mx-2 rounded-2xl bg-white/10 p-3 ${compact ? "px-2" : ""}`}>
          {!compact && <p className="text-xs text-[#D1FF42]">{role ? roleLabel(role) : "Signed in"}</p>}
          <button type="button" className="mt-2 flex items-center gap-2 text-sm text-white/80 hover:text-white" onClick={signOut}>
            <LogOut className="size-4" aria-hidden />
            {!compact && <span>Sign out</span>}
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="p2p-console min-h-screen">
      <div className="flex min-h-screen">
        <aside className={`p2p-sidebar relative sticky top-0 hidden h-screen shrink-0 flex-col overflow-hidden py-5 transition-[width] duration-200 md:flex ${collapsed ? "is-collapsed w-[4.75rem]" : "w-72"}`}>
          <button
            type="button"
            className="absolute -right-3 top-7 hidden size-6 place-items-center rounded-full border border-[#C7D1DD] bg-white text-[#0251B0] shadow-sm md:grid"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setCollapsed((value) => !value)}
          >
            <ChevronLeft className={`size-3.5 transition ${collapsed ? "rotate-180" : ""}`} />
          </button>
          {navigation(collapsed)}
        </aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-[#012456]/40" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside className="p2p-sidebar relative flex h-full w-[min(100%,18rem)] flex-col overflow-y-auto py-5">{navigation(false)}</aside>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" className="rounded-xl border border-[#C7D1DD] p-2 text-[#0251B0] md:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
                {open ? <X className="size-5" /> : <Menu className="size-5" />}
              </button>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-[#64748b]">Admin Console / {title}</p>
                <p className="truncate font-display text-lg font-bold text-[#111827]">{title}</p>
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              {role === "SUPER_ADMIN" ? (
                <button type="button" className="rounded-xl px-2 py-2 text-xs font-semibold text-[#0251B0]" onClick={() => setPasswordOpen(true)}>
                  {roleLabel(role)}
                </button>
              ) : (
                <span className="px-2 py-2 text-xs font-semibold text-[#0251B0]">{role ? roleLabel(role) : "Account"}</span>
              )}
              <button type="button" className="rounded-xl border border-[#E2E8F0] bg-white px-3 py-2 text-sm" onClick={() => setMenu((value) => !value)} aria-expanded={menu} aria-label="Account menu">
                Account
              </button>
              {menu && (
                <div className="absolute right-0 mt-12 w-44 rounded-2xl border border-[#E2E8F0] bg-white p-2 shadow-pop">
                  <button type="button" className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-[#F3F5F7]" onClick={signOut}>
                    <LogOut className="size-4" aria-hidden /> Sign out
                  </button>
                </div>
              )}
            </div>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      {role === "SUPER_ADMIN" && <SuperAdminPassword open={passwordOpen} onClose={() => setPasswordOpen(false)} />}
    </div>
  );
}
