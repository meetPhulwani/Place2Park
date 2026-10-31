import * as React from "react";
import Link from "@/components/link";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { GoogleButton } from "@/components/google-button";

const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login } = useAuth();
  const next = params.get("next") ?? undefined;
  const justRegistered = params.get("registered") === "1";
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const dest = next && next.startsWith("/") ? next : "/dashboard";

  React.useEffect(() => {
    document.title = "Log in · Place2Park";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      login(data.data.token, data.data.user);
      navigate(dest);
    } catch (e2) {
      setError(errorMessage(e2, "Incorrect email or password."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-500">
        Welcome back
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">Log in to manage bookings and listings.</p>

      {justRegistered && (
        <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">
          Account created — log in to continue.
        </p>
      )}

      <div className="mt-6 space-y-4">
        {googleEnabled && (
          <>
            <GoogleButton next={dest} />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or with email</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                Forgot password?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <FieldError error={error ?? undefined} />
          <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading}>
            Log in
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        New to Place2Park?{" "}
        <Link href="/signup" className="font-medium text-brand-700 hover:text-brand-800">
          Create an account
        </Link>
      </p>
    </div>
  );
}
