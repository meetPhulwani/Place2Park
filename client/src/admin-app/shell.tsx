import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Building2,
  CalendarClock,
  CircleHelp,
  ClipboardList,
  CreditCard,
  Flag,
  LayoutDashboard,
  LifeBuoy,
  Menu,
  Settings,
  Shield,
  Star,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { consoleApi } from "@/services/console-api";
import "./console.css";

const links = [
  ["/", "Overview", LayoutDashboard],
  ["/users", "Users", Users],
  ["/listings", "Listings", Building2],
  ["/bookings", "Bookings", CalendarClock],
  ["/payments", "Payments", CreditCard],
  ["/payouts", "Payouts", Wallet],
  ["/reports", "Reports", Flag],
  ["/support", "Support", LifeBuoy],
  ["/faqs", "FAQs", CircleHelp],
  ["/reviews", "Reviews", Star],
  ["/staff", "Administrators", Shield],
  ["/audits", "Audit log", ClipboardList],
  ["/settings", "Configuration", Settings],
  ["/security", "Security", Activity],
] as const;

export function ConsoleShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);

  function signOut() {
    void consoleApi.post("/auth/logout").finally(() => navigate("/sign-in"));
  }

  const nav = (
    <>
      <div className="px-3 pb-5">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-[#D1FF42] font-display text-lg font-bold text-[#012456]">P</span>
          <div>
            <p className="font-display text-lg font-bold leading-none tracking-tight">Place2Park</p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-[#D1FF42]">Admin Console</p>
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
        {links.map(([to, label, Icon]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className="p2p-nav-link"
            onClick={() => setOpen(false)}
          >
            <span className="p2p-nav-mark" />
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </NavLink>
        ))}
      </nav>
      <button type="button" className="mx-2 rounded-xl px-3 py-2 text-left text-sm text-white/80 hover:bg-white/10" onClick={signOut}>
        Sign out
      </button>
    </>
  );

  return (
    <div className="p2p-console min-h-screen">
      <div className="flex min-h-screen">
        <aside className="p2p-sidebar sticky top-0 hidden h-screen w-72 shrink-0 flex-col py-5 md:flex">{nav}</aside>
        {open && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button type="button" className="absolute inset-0 bg-[#012456]/40" aria-label="Close menu" onClick={() => setOpen(false)} />
            <aside className="p2p-sidebar relative flex h-full w-[min(100%,18rem)] flex-col py-5">{nav}</aside>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#C7D1DD]/80 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-xl bg-[#D1FF42] font-bold text-[#012456]">P</span>
              <span className="font-display font-bold text-[#0251B0]">Place2Park</span>
            </div>
            <button type="button" className="rounded-xl border border-[#C7D1DD] p-2 text-[#0251B0]" onClick={() => setOpen((value) => !value)} aria-label={open ? "Close navigation" : "Open navigation"}>
              {open ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>
          </header>
          <main className="px-4 py-6 sm:px-6 lg:px-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={reduce ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -6 }}
                transition={{ duration: reduce ? 0 : 0.22, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </div>
  );
}
