import * as React from "react";
import Link from "@/components/link";
import { KeyRound, LifeBuoy, Mail, MessageSquareWarning } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export default function SupportPage() {
  React.useEffect(() => {
    document.title = "Support · Parkly";
  }, []);
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50">
            <LifeBuoy className="size-6 text-brand-700" aria-hidden />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">
            How can we help?
          </h1>
          <p className="mx-auto mt-2 max-w-md text-slate-500">
            We aim to respond within a few hours. For active bookings, include your booking ID
            (e.g. PK-XXXXXX).
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          <a
            href="mailto:support@parkly.example"
            className="glass rounded-2xl p-6 transition-shadow hover:shadow-card-hover"
          >
            <Mail className="size-6 text-brand-700" aria-hidden />
            <h2 className="mt-3 font-semibold text-slate-900">Email support</h2>
            <p className="mt-1 text-sm text-slate-500">
              support@parkly.example — bookings, payments, refunds and account help.
            </p>
          </a>
          <div className="glass rounded-2xl p-6">
            <MessageSquareWarning className="size-6 text-brand-700" aria-hidden />
            <h2 className="mt-3 font-semibold text-slate-900">Report a listing</h2>
            <p className="mt-1 text-sm text-slate-500">
              Use the “Report this listing” link on any parking page. Reports go straight to our
              moderation queue.
            </p>
          </div>
        </div>
        <div className="mt-8 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <p className="flex items-center gap-2 font-semibold text-brand-900">
            <KeyRound className="size-4.5" aria-hidden />
            Safety reminder
          </p>
          <p className="mt-1 text-sm text-brand-800">
            Parkly is self-parking only. If anyone asks you to hand over your vehicle keys, refuse
            and report the listing immediately.
          </p>
        </div>
        <p className="mt-8 text-center text-sm text-slate-500">
          Common questions are answered in the{" "}
          <Link href="/#faq" className="font-medium text-brand-700 hover:text-brand-800">
            FAQ
          </Link>
          .
        </p>
      </main>
      <Footer />
    </>
  );
}
