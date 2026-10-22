import * as React from "react";
import Link from "@/components/link";
import {
  ShieldCheck, MapPin, Clock, IndianRupee, KeyRound, Star, Search,
  CalendarCheck2, Car, ArrowRight, BadgeCheck, Camera, Wallet,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SearchBar } from "@/components/search-bar";
import { api } from "@/services/api";
import { formatINR } from "@/lib/utils";

const featuredAreas = [
  { name: "Bandra West", blurb: "Linking Road, Pali Hill & cafés" },
  { name: "Bandra Kurla Complex (BKC)", blurb: "Offices & business meetings" },
  { name: "Andheri West", blurb: "Malls, metro & nightlife" },
  { name: "Powai", blurb: "Hiranandani & lakeside offices" },
  { name: "Lower Parel", blurb: "High Street Phoenix & mills" },
  { name: "Dadar", blurb: "Station, markets & events" },
];

const faqs = [
  {
    q: "Is my parking spot guaranteed?",
    a: "Yes. Once your booking is confirmed and paid, the slot is reserved exclusively for your time window. Double booking is blocked at the database level.",
  },
  {
    q: "Do I hand over my car keys?",
    a: "Never. Parkly is self-parking only — you drive in, park in your reserved slot, and keep your keys. No valet, no key handover, ever.",
  },
  {
    q: "How do prices work?",
    a: "Hosts set an hourly price. You see the full breakdown — parking cost plus a small service fee — before you pay. No hidden charges on arrival.",
  },
  {
    q: "Can I cancel a booking?",
    a: "Yes. Cancel up to an hour before your start time for a full refund. Later cancellations may not be refundable, and the policy is always shown before you book.",
  },
  {
    q: "How do I earn from my empty parking spot?",
    a: "List your space with photos, availability and an hourly price. Drivers book and pay online; you receive earnings after our platform fee. You stay in control of your calendar.",
  },
  {
    q: "Are the spaces verified?",
    a: "Listings go through a review process, and verified spaces carry a badge. Ratings and reviews from real bookings keep quality visible.",
  },
];

export default function LandingPage() {
  const [stats, setStats] = React.useState<{ count: number; avgPricePerHour: number }>({
    count: 0,
    avgPricePerHour: 5000,
  });
  React.useEffect(() => {
    document.title = "Parkly — Find parking before you arrive";
    api
      .get("/parking/stats")
      .then(({ data }) => setStats(data.data))
      .catch(() => undefined);
  }, []);
  const spaceCount = stats.count;

  return (
    <>
      <Navbar />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-slate-950">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(ellipse 70% 55% at 65% 0%, rgba(35,151,126,0.28), transparent), radial-gradient(ellipse 45% 45% at 15% 100%, rgba(16,79,68,0.35), transparent)",
            }}
          />
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.08) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          <div className="relative mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
                <ShieldCheck className="size-3.5" aria-hidden />
                Verified private parking · Self-parking only
              </p>
              <h1 className="font-display text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
                Find parking <span className="text-brand-400">before</span> you arrive.
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Reserve a verified private parking space near your destination — guaranteed for
                your time slot, at a transparent price. Park it yourself and keep your keys.
              </p>
            </div>
            <div className="mt-8 max-w-4xl">
              <SearchBar />
            </div>
            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4">
              {[
                { k: "Guaranteed slot", v: "Reserved just for you" },
                { k: `${spaceCount}+ spaces`, v: "Across Mumbai (demo)" },
                {
                  k: `From ${formatINR(1500)}/hr`,
                  v: `Avg ${formatINR(stats.avgPricePerHour)}/hr`,
                },
                { k: "No key handover", v: "Self-parking, always" },
              ].map((s) => (
                <div key={s.k}>
                  <dt className="text-sm font-semibold text-white">{s.k}</dt>
                  <dd className="text-xs text-slate-400">{s.v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
              Parking, sorted in three steps
            </h2>
            <p className="mt-2 text-slate-500">
              No circling the block. No arguing over street rates. Know exactly where you&apos;ll
              park before you leave home.
            </p>
          </div>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {[
              {
                icon: Search,
                title: "Search your destination",
                body: "Enter where you're headed, when, and for how long. See verified spaces nearby with live availability and walking distance.",
              },
              {
                icon: CalendarCheck2,
                title: "Reserve & pay online",
                body: "Pick a space, confirm your time slot, and pay securely. The price you see is the price you pay — service fee included upfront.",
              },
              {
                icon: Car,
                title: "Drive in & park yourself",
                body: "Show your access code at the gate, park in your reserved slot, and keep your keys. Directions are one tap away.",
              },
            ].map((s, i) => (
              <div
                key={s.title}
                className="group glass relative rounded-2xl p-6 transition-shadow hover:shadow-card-hover"
              >
                <span className="absolute right-5 top-5 font-display text-4xl font-bold text-slate-100 transition-colors group-hover:text-brand-100">
                  {i + 1}
                </span>
                <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-brand-50">
                  <s.icon className="size-5.5 text-brand-700" aria-hidden />
                </div>
                <h3 className="text-base font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Benefits */}
        <section className="border-y border-white/40">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
              Why drivers choose Parkly
            </h2>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
              {[
                {
                  icon: MapPin,
                  title: "Right where you need it",
                  body: "Private spaces inside societies, offices and hotels — often closer than any public lot.",
                },
                {
                  icon: Clock,
                  title: "Guaranteed for your slot",
                  body: "Your booking blocks the space for your exact window. No one else can take it.",
                },
                {
                  icon: IndianRupee,
                  title: "Transparent pricing",
                  body: "Hourly rates and fees shown upfront. Pay online — nothing to settle in cash.",
                },
                {
                  icon: KeyRound,
                  title: "Keys stay with you",
                  body: "Strictly self-parking. There is no valet and no key handover, anywhere on Parkly.",
                },
              ].map((b) => (
                <div key={b.title}>
                  <div className="glass mb-3 flex size-10 items-center justify-center rounded-xl">
                    <b.icon className="size-5 text-brand-700" aria-hidden />
                  </div>
                  <h3 className="text-[15px] font-semibold text-slate-900">{b.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-slate-500">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trust & safety */}
        <section id="trust" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Built on trust, checked at every step
              </h2>
              <p className="mt-3 text-slate-500">
                Every listing carries its safety details openly — verification status, security
                features, and reviews from drivers who actually parked there.
              </p>
              <ul className="mt-8 space-y-5">
                {[
                  {
                    icon: BadgeCheck,
                    title: "Verified listings",
                    body: "Spaces are reviewed before going live. Verified spots carry a visible badge.",
                  },
                  {
                    icon: Star,
                    title: "Real ratings & reviews",
                    body: "Only drivers who completed a booking can review — no fake feedback.",
                  },
                  {
                    icon: Camera,
                    title: "Security details upfront",
                    body: "CCTV, gated access, guards, covered parking — all visible before you book.",
                  },
                  {
                    icon: KeyRound,
                    title: "Never hand over your keys",
                    body: "Self-parking is a platform rule, not a suggestion. Report any listing that asks otherwise.",
                  },
                ].map((t) => (
                  <li key={t.title} className="flex gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50">
                      <t.icon className="size-5 text-brand-700" aria-hidden />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-semibold text-slate-900">{t.title}</h3>
                      <p className="mt-0.5 text-sm text-slate-500">{t.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="glass-dark rounded-3xl p-8 sm:p-10">
              <p className="text-sm font-medium uppercase tracking-wider text-brand-400">
                The Parkly promise
              </p>
              <blockquote className="mt-4 font-display text-2xl font-semibold leading-snug text-white">
                “Your car, your keys, your reserved spot. We just make sure it&apos;s waiting for
                you.”
              </blockquote>
              <div className="mt-8 grid grid-cols-2 gap-4">
                {[
                  ["100%", "prepaid & guaranteed bookings"],
                  ["0", "key handovers — ever"],
                  ["24×7", "booking support"],
                  ["1 tap", "navigation to your spot"],
                ].map(([big, small]) => (
                  <div key={small} className="rounded-2xl bg-white/8 p-4 ring-1 ring-white/10">
                    <p className="font-display text-2xl font-bold text-brand-300">{big}</p>
                    <p className="mt-1 text-xs text-slate-400">{small}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Host value prop */}
        <section id="host-earnings" className="border-y border-slate-200 bg-brand-950 scroll-mt-20">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-brand-500/40 bg-brand-500/10 px-3 py-1 text-xs font-medium text-brand-300">
                  <Wallet className="size-3.5" aria-hidden />
                  For hosts
                </p>
                <h2 className="font-display text-3xl font-bold tracking-tight text-white">
                  Your empty parking spot is money standing still
                </h2>
                <p className="mt-3 text-slate-300">
                  Societies, offices, hotels and individuals list unused spaces on Parkly and earn
                  from hours that would otherwise go to waste. You set the price, the schedule and
                  the rules.
                </p>
                <ul className="mt-6 space-y-3 text-sm text-slate-300">
                  {[
                    "Set your own hourly rate and availability",
                    "Drivers are prepaid and identity-backed",
                    "Pause your listing anytime — no lock-in",
                    "Track bookings and earnings in a clean dashboard",
                  ].map((t) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4 shrink-0 text-brand-400" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/become-a-host"
                  className="mt-8 inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-3 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-400"
                >
                  Start earning from your space
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              </div>
              <div className="glass-dark rounded-3xl p-8">
                <p className="text-sm text-slate-400">Example: one covered spot in Bandra</p>
                <div className="mt-4 space-y-3">
                  {[
                    ["₹60/hour × 6 booked hrs/day", "₹360/day"],
                    ["Busy weekdays (22 days/month)", "₹7,920/month"],
                    ["Host commission (10%)", "− ₹792"],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between border-b border-white/10 pb-3 text-sm"
                    >
                      <span className="text-slate-300">{label}</span>
                      <span className="font-medium text-white">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-sm font-semibold text-white">Your estimated earnings</span>
                    <span className="font-display text-2xl font-bold text-brand-300">
                      ₹7,128<span className="text-sm font-medium text-slate-400">/month</span>
                    </span>
                  </div>
                </div>
                <p className="mt-4 text-xs text-slate-500">
                  Illustrative example only. Actual earnings depend on location, pricing and demand.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Featured locations */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                Popular in Mumbai
              </h2>
              <p className="mt-2 text-slate-500">Neighbourhoods where drivers book the most.</p>
            </div>
            <Link
              href="/search"
              className="hidden items-center gap-1.5 text-sm font-medium text-brand-700 hover:text-brand-800 sm:inline-flex"
            >
              Browse all <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuredAreas.map((a) => (
              <Link
                key={a.name}
                href={`/search?q=${encodeURIComponent(a.name)}`}
                className="group glass flex items-center justify-between rounded-2xl p-5 transition-all hover:shadow-card-hover"
              >
                <div className="flex items-center gap-3.5">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 transition-colors group-hover:bg-brand-50">
                    <MapPin className="size-5 text-slate-500 transition-colors group-hover:text-brand-700" aria-hidden />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-slate-900">{a.name}</h3>
                    <p className="text-xs text-slate-500">{a.blurb}</p>
                  </div>
                </div>
                <ArrowRight className="size-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-brand-600" aria-hidden />
              </Link>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
            <h2 className="text-center font-display text-3xl font-bold tracking-tight text-slate-900">
              Frequently asked questions
            </h2>
            <div className="mt-10 space-y-3">
              {faqs.map((f) => (
                <details
                  key={f.q}
                  className="group glass rounded-2xl px-5 open:pb-4"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between py-4 text-[15px] font-medium text-slate-900 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span className="ml-4 text-slate-400 transition-transform group-open:rotate-45">＋</span>
                  </summary>
                  <p className="text-sm leading-relaxed text-slate-500">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6">
          <div className="glass-dark rounded-3xl px-6 py-14 text-center sm:px-14">
            <h2 className="mx-auto max-w-xl font-display text-3xl font-bold tracking-tight text-white">
              Never circle the block again.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-slate-400">
              Reserve your next parking spot in under a minute — guaranteed, prepaid, and waiting
              for you.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/search"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-brand-950 transition-colors hover:bg-brand-400 sm:w-auto"
              >
                <Search className="size-4" aria-hidden />
                Find parking now
              </Link>
              <Link
                href="/become-a-host"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/10 sm:w-auto"
              >
                List your space
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
