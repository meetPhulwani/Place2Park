import Link from "@/components/link";
import { useAuth } from "@/context/auth";
import { Logo } from "./brand";

/** Host links stay on the public site and for providers and all-rounders. Seekers do not see them. */
export function showHostColumn(role?: string | null) {
  if (!role) return true;
  const value = role.toUpperCase();
  return value === "HOST" || value === "BOTH";
}

const columns = [
  {
    title: "Drivers",
    links: [
      { href: "/search", label: "Find parking" },
      { href: "/signup", label: "Create account" },
      { href: "/search", label: "Find parking" },
      { href: "/faqs", label: "FAQ" },
    ],
  },
  {
    title: "Hosts",
    links: [
      { href: "/become-a-host", label: "List your space" },
      { href: "/#host-earnings", label: "Earnings" },
      { href: "/#trust", label: "Trust & safety" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/#trust", label: "Safety" },
      { href: "/support", label: "Support" },
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms-and-conditions", label: "Terms & Conditions" },
    ],
  },
];

export function Footer() {
  const { user } = useAuth();
  const visible = columns.filter((col) => col.title !== "Hosts" || showHostColumn(user?.role));

  return (
    <footer className="mt-4 border-t border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div
          className={
            visible.length === columns.length
              ? "grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]"
              : "grid gap-10 md:grid-cols-[1.4fr_repeat(2,1fr)]"
          }
        >
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">
              Reserve verified private parking before you arrive. Self-parking only — you never
              hand over your keys.
            </p>
          </div>
          {visible.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-slate-900">{col.title}</h3>
              <ul className="mt-3 space-y-2">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="text-sm text-slate-500 transition-colors hover:text-slate-900"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-center gap-2 border-t border-slate-200 pt-6 text-center">
          <p className="text-sm font-semibold text-brand-500">Never hand over your vehicle keys.</p>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Place2Park.</p>
        </div>
      </div>
    </footer>
  );
}
