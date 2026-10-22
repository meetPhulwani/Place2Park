import * as React from "react";
import Link from "@/components/link";
import { BadgeCheck, ChevronRight, ShieldAlert, User, Wallet } from "lucide-react";
import { useAuth } from "@/context/auth";
import { api, errorMessage, fieldErrors } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

export default function HostSettingsPage() {
  const { user } = useAuth();
  const [profile, setProfile] = React.useState({
    submitted: false,
    verified: false,
    accountHolder: "",
    ifsc: "",
    accountLast4: "",
  });
  const [form, setForm] = React.useState({ accountHolder: "", ifsc: "", accountNumber: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    document.title = "Host settings · Parkly";
    api.get("/host/payout-profile").then(({ data }) => {
      const p = data.data.payoutProfile;
      setProfile(p);
      setForm((f) => ({ ...f, accountHolder: p.accountHolder ?? "", ifsc: p.ifsc ?? "" }));
    }).catch(() => undefined);
  }, []);

  async function savePayout(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const { data } = await api.put("/host/payout-profile", form);
      setProfile(data.data.payoutProfile);
      setForm((f) => ({ ...f, accountNumber: "" }));
      toast.success("Payout details saved. An admin must verify them before you can request a payout.");
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, "Could not save payout details."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Host settings
        </h1>
        <p className="mt-1 text-sm text-slate-500">Verification, payouts and account basics.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Verification</CardTitle>
        </CardHeader>
        <CardContent>
          {user?.hostVerified ? (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <BadgeCheck className="size-6 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-emerald-900">You&apos;re a verified host</p>
                <p className="text-sm text-emerald-700">
                  Your listings carry the verified badge, which improves booking rates.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <ShieldAlert className="size-6 shrink-0 text-amber-600" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-amber-900">Verification pending</p>
                <p className="text-sm text-amber-800">
                  Our team verifies hosts as part of listing review. Publishing a complete listing
                  with photos speeds this up.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payout details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Wallet className="size-6 shrink-0 text-slate-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Manual bank payouts
                <Badge variant="outline" className="ml-1">
                  {profile.verified ? "Verified" : profile.submitted ? "Awaiting verification" : "Not submitted"}
                </Badge>
              </p>
              <p className="text-sm text-slate-500">
                Razorpay Route is not enabled for this platform. Admins pay eligible earnings after
                reviewing a request. We store the account number encrypted and only show the last 4 digits here.
                {profile.accountLast4 ? ` Current account ending ${profile.accountLast4}.` : ""}
              </p>
            </div>
          </div>
          <form className="space-y-3" onSubmit={(e) => void savePayout(e)}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="accountHolder">
                Account holder
              </label>
              <Input
                id="accountHolder"
                value={form.accountHolder}
                onChange={(e) => setForm((f) => ({ ...f, accountHolder: e.target.value }))}
                required
              />
              {errors.accountHolder && <p className="mt-1 text-xs text-red-600">{errors.accountHolder}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="ifsc">
                IFSC
              </label>
              <Input
                id="ifsc"
                value={form.ifsc}
                onChange={(e) => setForm((f) => ({ ...f, ifsc: e.target.value.toUpperCase() }))}
                maxLength={11}
                required
              />
              {errors.ifsc && <p className="mt-1 text-xs text-red-600">{errors.ifsc}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="accountNumber">
                Account number
              </label>
              <Input
                id="accountNumber"
                value={form.accountNumber}
                onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, "") }))}
                inputMode="numeric"
                autoComplete="off"
                placeholder={profile.accountLast4 ? `Saved account ending ${profile.accountLast4}` : "Digits only"}
                required
              />
              {errors.accountNumber && <p className="mt-1 text-xs text-red-600">{errors.accountNumber}</p>}
            </div>
            <Button type="submit" disabled={busy}>
              Save payout details
            </Button>
          </form>
        </CardContent>
      </Card>

      <Link
        href="/profile"
        className="glass flex items-center justify-between rounded-2xl p-5 transition-shadow hover:shadow-card-hover"
      >
        <span className="flex items-center gap-3">
          <User className="size-5 text-slate-400" aria-hidden />
          <span>
            <span className="block text-sm font-semibold text-slate-900">Account profile</span>
            <span className="block text-sm text-slate-500">
              {user?.name} · {user?.email}
              {user?.phone ? ` · ${user.phone}` : ""}
            </span>
          </span>
        </span>
        <ChevronRight className="size-5 text-slate-300" aria-hidden />
      </Link>
    </div>
  );
}
