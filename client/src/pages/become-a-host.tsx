import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarCheck2, IndianRupee, ShieldCheck, Wallet } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";

export default function BecomeAHostPage() {
  const navigate = useNavigate();
  const { user, loading, refresh } = useAuth();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    document.title = "Become a host · Parkly";
  }, []);

  React.useEffect(() => {
    if (loading) return;
    if (!user) navigate("/login?next=/become-a-host", { replace: true });
    else if (["HOST", "BOTH", "ADMIN"].includes(user.role)) navigate("/host", { replace: true });
  }, [user, loading, navigate]);

  async function enable() {
    setBusy(true);
    try {
      await api.post("/users/me/become-host");
      toast.success("Host tools enabled — welcome aboard!");
      await refresh();
      navigate("/host", { replace: true });
    } catch (e) {
      toast.error(errorMessage(e, "Something went wrong."));
      setBusy(false);
    }
  }

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800">
            <Wallet className="size-3.5" aria-hidden />
            Host on Parkly
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
            Turn your empty parking spot into income
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-500">
            Whether it&apos;s one driveway spot or a society&apos;s visitor block, list it in
            minutes. You control the price, schedule and rules — we handle bookings and payments.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: IndianRupee,
              title: "You set the price",
              body: "Hourly rates you control. You keep 90% of the parking fee; drivers pay a separate 5% platform fee.",
            },
            {
              icon: CalendarCheck2,
              title: "You set the schedule",
              body: "Weekly availability, blocked dates, pause anytime. Your space, your rules.",
            },
            {
              icon: ShieldCheck,
              title: "Prepaid drivers",
              body: "Every booking is paid online before arrival. Self-parking only, no keys.",
            },
          ].map((c) => (
            <div key={c.title} className="glass rounded-2xl p-5">
              <c.icon className="size-6 text-brand-700" aria-hidden />
              <h2 className="mt-3 text-[15px] font-semibold text-slate-900">{c.title}</h2>
              <p className="mt-1 text-sm text-slate-500">{c.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <Button size="lg" onClick={enable} loading={busy}>
            Enable host tools
            <ArrowRight className="size-4" aria-hidden />
          </Button>
          <p className="mt-3 text-xs text-slate-400">
            Enables host tools on your existing account. You can keep booking parking as usual.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
