import Link from "@/components/link";
import { Logo } from "./brand";

const columns = [
  {
    title: "Drivers",
    links: [
      { href: "/search", label: "Find parking" },
      { href: "/signup", label: "Create account" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#faq", label: "FAQ" },
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
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-4 border-t border-white/40">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-slate-500">
              Reserve verified private parking before you arrive. Self-parking only — you never
              hand over your keys.
            </p>
          </div>
          {columns.map((col) => (
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
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-400">
            © {new Date().getFullYear()} Parkly. Demo product — listings shown in development are
            fictional sample data.
          </p>
          <p className="text-xs font-medium text-brand-700">Never hand over your vehicle keys.</p>
        </div>
      </div>
    </footer>
  );
}
