import * as React from "react";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { clearEmailOtpChallenge, readEmailOtpChallenge, saveEmailOtpChallenge } from "@/lib/google-auth";

function clock(total: number) {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [pending] = React.useState(() => readEmailOtpChallenge());
  const [meta, setMeta] = React.useState(pending?.meta ?? null);
  const [otp, setOtp] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    document.title = "Verify your email · Place2Park";
  }, []);

  React.useEffect(() => {
    if (!pending) navigate("/signup", { replace: true });
  }, [navigate, pending]);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  const expiresLeft = meta ? Math.max(0, Math.ceil((new Date(meta.expiresAt).getTime() - now) / 1000)) : 0;
  const resendLeft = meta ? Math.max(0, Math.ceil((new Date(meta.resendAvailableAt).getTime() - now) / 1000)) : 0;

  async function resend() {
    if (!pending || resendLeft > 0) return;
    setError(null);
    setSending(true);
    try {
      const { data } = await api.post("/auth/email-otp/resend", { pendingToken: pending.pendingToken });
      const next = {
        pendingToken: pending.pendingToken,
        maskedEmail: data.data.maskedEmail as string,
        expiresAt: data.data.expiresAt as string,
        resendAvailableAt: data.data.resendAvailableAt as string,
      };
      saveEmailOtpChallenge(next, meta?.next);
      setMeta({ ...next, next: meta?.next && meta.next.startsWith("/") ? meta.next : "/dashboard" });
      setOtp("");
    } catch (e2) {
      const message = errorMessage(e2, "Couldn't send another code.");
      if (/start again/i.test(message)) clearEmailOtpChallenge();
      setError(message);
    } finally {
      setSending(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError(null);
    if (!/^\d{6}$/.test(otp)) {
      setError("Enter the 6-digit code.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/email-otp/verify", { pendingToken: pending.pendingToken, otp });
      const next = meta?.next && meta.next.startsWith("/") ? meta.next : "/dashboard";
      clearEmailOtpChallenge();
      login(data.data.token, data.data.user);
      navigate(next);
    } catch (e2) {
      const message = errorMessage(e2, "Couldn't verify that code.");
      if (e2 instanceof AxiosError && e2.response?.status === 400 && /start again/i.test(message)) {
        clearEmailOtpChallenge();
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!pending || !meta) return null;

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-500">Verify your email</h1>
      <p className="mt-1.5 text-sm text-slate-500">We've sent a 6-digit verification code to your email.</p>
      <p className="mt-3 text-sm font-medium text-slate-800">{meta.maskedEmail}</p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
        <div>
          <Label htmlFor="email-otp">Verification code</Label>
          <Input
            id="email-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit code"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            {expiresLeft > 0 ? `Code expires in ${clock(expiresLeft)}.` : "That code has expired. Request a new one."}
          </p>
        </div>
        <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading}>
          Verify OTP
        </Button>
        <Button type="button" variant="secondary" className="w-full" loading={sending} disabled={resendLeft > 0} onClick={resend}>
          {resendLeft > 0 ? `Resend in ${resendLeft}s` : "Resend OTP"}
        </Button>
      </form>
    </div>
  );
}
