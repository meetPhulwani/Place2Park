import type { ReactNode } from "react";
import Link from "@/components/link";
import { useAuth } from "@/context/auth";
import { Logo } from "./brand";
import { UserMenu, MobileMenu } from "./navbar-client";

export function Navbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <nav
        className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:h-16 sm:px-6"
        aria-label="Primary"
      >
        <Logo />
        <div className="hidden items-center gap-1 md:flex">
          <NavLink href="/search">Find parking</NavLink>
          {user && ["HOST", "BOTH", "ADMIN"].includes(user.role) ? (
            <NavLink href="/host">Host dashboard</NavLink>
          ) : (
            <NavLink href="/become-a-host">Become a host</NavLink>
          )}
          <NavLink href="/#how-it-works">How it works</NavLink>
        </div>
        <div className="flex items-center gap-2">
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
                className="hidden rounded-lg px-4 py-2 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-ink sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-600"
              >
                Sign up
              </Link>
            </>
          )}
          <MobileMenu
            loggedIn={!!user}
            isHost={!!user && ["HOST", "BOTH", "ADMIN"].includes(user.role)}
            isAdmin={user?.role === "ADMIN"}
          />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:bg-page hover:text-ink"
    >
      {children}
    </Link>
  );
}
