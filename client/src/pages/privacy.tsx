import * as React from "react";
import Link from "@/components/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

export default function PrivacyPage() {
  React.useEffect(() => {
    document.title = "Privacy policy · Place2Park";
  }, []);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-12 sm:px-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Privacy policy</h1>
        <p className="text-sm leading-6 text-muted">
          Place2Park stores the account details needed to run bookings: your name, email, phone, profile photo, vehicles, and saved places. Signed-in users can download that information from Settings.
        </p>
        <p className="text-sm leading-6 text-muted">
          Email and phone changes require a verification code. Card numbers and card security codes are entered with the payment provider and are not stored by Place2Park. Host bank details are masked. A full account number is never shown in the app.
        </p>
        <p className="text-sm leading-6 text-muted">
          Hosts can hide their name on public listings. Booking, payment, payout, and audit records can be kept after an account is deleted where they are needed for refunds, disputes, accounting, or fraud checks. Those retained records do not keep the deleted account's personal details.
        </p>
        <p className="text-sm text-muted">
          Questions go to <Link href="/support" className="font-medium text-brand-600">Support</Link>.
        </p>
      </main>
      <Footer />
    </>
  );
}
