import * as React from "react";
import Link from "@/components/link";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth";
import {
  Menu, X, LayoutDashboard, CalendarClock, History, Heart, User,
  Building2, LogOut, Search, ShieldCheck,
} from "lucide-react";
import { Avatar } from "./ui/avatar";
import { cn } from "@/lib/utils";

export function UserMenu({
  name,
  email,
  image,
  role,
}: {
  name: string;
  email: string;
  image?: string | null;
  role: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/bookings", label: "My bookings", icon: CalendarClock },
    { href: "/history", label: "History", icon: History },
    { href: "/saved", label: "Saved", icon: Heart },
    { href: "/profile", label: "Profile", icon: User },
    ...(["HOST", "BOTH", "ADMIN"].includes(role)
      ? [{ href: "/host", label: "Host dashboard", icon: Building2 }]
      : []),
    ...(role === "ADMIN" ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div ref={ref} className="relative hidden md:block">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Account menu"
        className="flex items-center rounded-full ring-2 ring-transparent transition hover:ring-brand-200"
      >
        <Avatar name={name} image={image} size={36} />
      </button>
      {open && (
        <div
          role="menu"
          className="glass-strong absolute right-0 mt-2 w-60 rounded-2xl p-1.5 animate-scale-in"
        >
          <div className="border-b border-slate-100 px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
            <p className="truncate text-xs text-slate-500">{email}</p>
          </div>
          <div className="py-1">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-slate-700 transition-colors hover:bg-white/55"
              >
                <it.icon className="size-4 text-slate-400" aria-hidden />
                {it.label}
              </Link>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-1">
            <button
              role="menuitem"
              onClick={() => {
                logout();
                navigate("/");
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="size-4" aria-hidden />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function MobileMenu({
  loggedIn,
  isHost,
  isAdmin,
}: {
  loggedIn: boolean;
  isHost: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const { logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { href: "/search", label: "Find parking", icon: Search },
    ...(loggedIn
      ? [
          { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { href: "/bookings", label: "My bookings", icon: CalendarClock },
          { href: "/history", label: "History", icon: History },
          { href: "/saved", label: "Saved", icon: Heart },
          { href: "/profile", label: "Profile", icon: User },
        ]
      : []),
    isHost
      ? { href: "/host", label: "Host dashboard", icon: Building2 }
      : { href: "/become-a-host", label: "Become a host", icon: Building2 },
    ...(isAdmin ? [{ href: "/admin", label: "Admin", icon: ShieldCheck }] : []),
  ];

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="rounded-xl p-2 text-slate-600 transition-colors hover:bg-white/50"
      >
        <Menu className="size-5" />
      </button>
      {open && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm animate-fade-in" onClick={() => setOpen(false)} />
          <div className="glass-strong absolute inset-y-0 right-0 w-[300px] p-5 animate-slide-up">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-display text-lg font-bold text-slate-900">Menu</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="space-y-1">
              {links.map((l) => (
                <Link
                  key={l.href + l.label}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-slate-700 transition-colors hover:bg-white/55"
                >
                  <l.icon className="size-4.5 text-slate-400" aria-hidden />
                  {l.label}
                </Link>
              ))}
            </nav>
            <div className="mt-6 border-t border-slate-100 pt-4">
              {loggedIn ? (
                <button
                  onClick={() => {
                    setOpen(false);
                    logout();
                    navigate("/");
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-red-600 hover:bg-red-50"
                  )}
                >
                  <LogOut className="size-4.5" aria-hidden />
                  Log out
                </button>
              ) : (
                <div className="grid gap-2">
                  <Link
                    href="/login"
                    onClick={() => setOpen(false)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-center text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Log in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setOpen(false)}
                    className="rounded-xl bg-brand-700 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-brand-800"
                  >
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
