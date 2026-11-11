import * as React from "react";
import Link from "@/components/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export default function TermsPage() {
  React.useEffect(() => {
    document.title = "Terms and conditions · Place2Park";
  }, []);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Terms and conditions</h1>
        <p className="text-sm leading-6 text-muted">
          Place2Park is a marketplace for reserving private parking. Creating an account is free. A booking is confirmed after the payment provider accepts the payment. You park yourself and keep your keys.
        </p>
        <p className="text-sm leading-6 text-muted">
          A driver can cancel a pending or confirmed booking before it starts. A refund is available when the cancellation is more than 60 minutes before the start time. Host earnings are paid through the existing payout review, not by an automatic bank transfer.
        </p>
        <p className="text-sm leading-6 text-muted">
          Account deletion is permanent once it is accepted. It waits while a booking, refund, dispute, or unpaid host payout is still open. Booking and payment records needed for those obligations can be retained.
        </p>
        <p className="text-sm text-muted">
          Booking questions go to <Link href="/support" className="font-medium text-brand-600">Support</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}