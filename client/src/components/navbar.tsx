import Link from "@/components/link";
import { useAuth } from "@/context/auth";
import { Logo } from "./brand";
import { UserMenu, MobileMenu } from "./navbar-client";

export function Navbar() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-4">
      <nav
        className="glass-strong mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 rounded-2xl px-3 sm:h-16 sm:px-5"
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
                className="hidden rounded-xl px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white/50 sm:block"
              >
                Log in
              </Link>
              <Link
                href="/signup"
                className="rounded-xl bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] transition-colors hover:bg-brand-800"
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-white/50 hover:text-slate-900"
    >
      {children}
    </Link>
  );
}
