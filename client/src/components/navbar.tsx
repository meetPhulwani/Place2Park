import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import Link from "@/components/link";
import { useAuth } from "@/context/auth";
import { Logo } from "./brand";
import { UserMenu, MobileMenu, showHostDashboardLink } from "./navbar-client";
import { cn } from "@/lib/utils";

export function Navbar({ overlay }: { overlay?: boolean }) {
  const { user } = useAuth();
  const showHostDashboard = showHostDashboardLink(user?.role);

  return (
    <header
      className={cn(
        overlay
          ? "border-b border-line bg-white"
          : "sticky top-0 z-40 border-b border-line bg-white"
      )}
    >
      <nav
        className="flex h-14 w-full items-center justify-between gap-4 px-4 sm:h-16 sm:px-6 lg:px-8"
        aria-label="Primary"
      >
        <Logo />
        {showHostDashboard && (
          <div className="hidden items-center gap-1 md:flex">
            <NavLink href="/host">Host dashboard</NavLink>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="hidden md:block">
            <NavLink href={user ? "/help" : "/faqs"}>Help Center</NavLink>
          </div>
          {user ? (
            <UserMenu
              name={user.name ?? "Account"}
              email={user.email ?? ""}
              image={user.image}
              role={user.role}
            />
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors duration-200 hover:bg-brand-50 hover:text-brand-700 sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-volt px-4 py-2 text-sm font-medium text-ink shadow-sm transition-colors duration-200 hover:bg-volt-dark"
              >
                Sign up
              </Link>
            </>
          )}
          <MobileMenu loggedIn={!!user} role={user?.role} />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const { pathname } = useLocation();
  const active = !href.startsWith("/#") && (pathname === href || (href !== "/" && pathname.startsWith(href)));
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-lg px-3.5 py-2 text-sm font-medium transition-colors duration-200",
        active ? "bg-brand-50 text-brand-600" : "text-muted hover:bg-brand-50 hover:text-brand-700"
      )}
    >
      {children}
    </Link>
  );
}
