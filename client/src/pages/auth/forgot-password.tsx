import * as React from "react";
import Link from "@/components/link";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { api, errorMessage } from "@/services/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    document.title = "Reset password · Place2Park";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err, "We couldn't send the reset email. Try again shortly."));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="text-center animate-fade-in">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50">
          <MailCheck className="size-6 text-brand-700" aria-hidden />
        </div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Check your email</h1>
        <p className="mt-2 text-sm text-slate-500">
          If an account exists for <span className="font-medium text-slate-700">{email}</span>,
          you&apos;ll receive a reset link shortly.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          ← Back to login
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
        Reset your password
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Send reset link
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>
    </div>
  );
}
