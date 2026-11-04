import { useEffect } from "react";
import { CircleHelp, Flag, Inbox, LifeBuoy } from "lucide-react";
import Link from "@/components/link";
import { DashboardHeader } from "@/components/dashboard/page-header";
import { FAQS } from "@/lib/support-labels";

const cards = [
  {
    href: "/help/report",
    title: "Report a driver or host",
    body: "Tell us about a problem with someone on a booking you were part of.",
    icon: Flag,
  },
  {
    href: "/help/contact",
    title: "Contact Place2Park support",
    body: "Open a ticket with Place2Park about your account, a payment, or the product.",
    icon: LifeBuoy,
  },
  {
    href: "/help/tickets",
    title: "My reports and tickets",
    body: "Check status, read replies, and answer when we ask for more detail.",
    icon: Inbox,
  },
  {
    href: "/help#faq",
    title: "Help center",
    body: "Short answers for bookings, refunds, and how reporting works.",
    icon: CircleHelp,
  },
];

export default function HelpCenterPage() {
  useEffect(() => {
    document.title = "Help & Support · Place2Park";
  }, []);
  return (
    <div className="space-y-8">
      <DashboardHeader
        title="Help & Support"
        description="Report a booking problem or ask Place2Park for help. Listing reports on a parking page still go to the listing queue."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-xl border border-line bg-white p-5 shadow-card transition-[border-color,box-shadow] duration-200 hover:border-brand-400 hover:shadow-card-hover"
          >
            <card.icon className="size-5 text-brand-500" aria-hidden />
            <h2 className="mt-3 font-display text-lg font-semibold text-ink">{card.title}</h2>
            <p className="mt-1 text-sm text-muted">{card.body}</p>
          </Link>
        ))}
      </div>
      <section id="faq" className="scroll-mt-24 space-y-3">
        <h2 className="font-display text-xl font-semibold text-ink">Help center</h2>
        {FAQS.map((item) => (
          <details key={item.q} className="rounded-xl border border-line bg-white px-5 py-4">
            <summary className="cursor-pointer font-medium text-ink">{item.q}</summary>
            <p className="mt-2 text-sm text-muted">{item.a}</p>
          </details>
        ))}
      </section>
    </div>
  );
}
