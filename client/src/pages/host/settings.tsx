import * as React from "react";
import Link from "@/components/link";
import { BadgeCheck, ChevronRight, ShieldAlert, User, Wallet } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function HostSettingsPage() {
  const { user } = useAuth();

  React.useEffect(() => {
    document.title = "Host settings · Parkly";
  }, []);

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
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Wallet className="size-6 shrink-0 text-slate-400" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Bank payouts <Badge variant="outline" className="ml-1">Coming with Razorpay Route</Badge>
              </p>
              <p className="text-sm text-slate-500">
                Weekly settlements to your bank account. Payout onboarding activates once payment
                credentials are configured for the platform.
              </p>
            </div>
          </div>
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
