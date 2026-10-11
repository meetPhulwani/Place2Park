import { Outlet } from "react-router-dom";
import Link from "@/components/link";
import { KeyRound, MapPin, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand";

export function AuthLayout() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-slate-950 lg:block">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 55% at 30% 10%, rgba(35,151,126,0.32), transparent), radial-gradient(ellipse 50% 45% at 85% 90%, rgba(16,79,68,0.4), transparent)",
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Logo dark />
          <div className="glass-dark max-w-md rounded-3xl p-8">
            <h1 className="font-display text-3xl font-bold leading-snug text-white">
              Guaranteed parking, booked before you leave home.
            </h1>
            <ul className="mt-8 space-y-4 text-sm text-slate-200">
              {[
                { icon: MapPin, text: "Verified private spaces near your destination" },
                { icon: ShieldCheck, text: "Transparent pricing — pay online, nothing on arrival" },
                { icon: KeyRound, text: "Self-parking only. Your keys never leave your hand." },
              ].map((i) => (
                <li key={i.text} className="flex items-center gap-3">
                  <i.icon className="size-4.5 shrink-0 text-brand-300" aria-hidden />
                  {i.text}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Parkly</p>
        </div>
      </aside>
      <div className="flex flex-col px-4 py-8 sm:px-8">
        <div className="flex items-center justify-between lg:justify-end">
          <span className="lg:hidden">
            <Logo />
          </span>
          <Link href="/" className="text-sm font-medium text-slate-500 hover:text-slate-900">
            ← Back to home
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="glass-strong w-full max-w-sm rounded-3xl p-6 sm:p-8">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
