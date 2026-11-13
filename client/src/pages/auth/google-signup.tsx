import * as React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { takeAuthMethod, trackSignUp } from "@/lib/ga";
import { clearGoogleRegistration, readGoogleRegistration } from "@/lib/google-auth";
import { safeNextPath } from "@/lib/safe-next";
import { signupRoles, type SignupRole } from "@/pages/auth/signup-role";
import { AuthLegalLinks } from "@/components/auth-legal-links";
import { cn } from "@/lib/utils";

function isSignupRole(value: unknown): value is SignupRole {
  return value === "DRIVER" || value === "HOST" || value === "BOTH";
}

export default function GoogleSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [pending] = React.useState(() => readGoogleRegistration());
  const chosen = (location.state as { role?: unknown } | null)?.role;
  const [role, setRole] = React.useState<SignupRole | null>(isSignupRole(chosen) ? chosen : null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    document.title = "Finish your account · Place2Park";
  }, []);

  React.useEffect(() => {
    if (!pending) navigate("/signup", { replace: true });
  }, [navigate, pending]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pending || !role) return;
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/google/complete", {
        registrationToken: pending.registrationToken,
        role,
      });
      const next = safeNextPath(pending.meta.next);
      clearGoogleRegistration();
      trackSignUp(takeAuthMethod());
      login(data.data.token, data.data.user);
      navigate(next);
    } catch (err) {
      const message = errorMessage(err, "Couldn't finish your account.");
      if (/start again|expired/i.test(message)) clearGoogleRegistration();
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  if (!pending) return null;

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-500">Finish your account</h1>
      <p className="mt-1.5 text-sm text-slate-500">
        Choose how you'll use Place2Park. Your Google account is {pending.meta.maskedEmail}.
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {error}
        </p>
      )}
      <form onSubmit={onSubmit} className="mt-6">
        <div className="space-y-2" role="radiogroup" aria-label="Account type">
          {signupRoles.map((option) => {
            const selected = role === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRole(option.value)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border bg-white px-3.5 py-3 text-left transition-all",
                  selected ? "border-brand-500 ring-2 ring-volt" : "border-line hover:border-brand-300"
                )}
              >
                <option.icon className={cn("size-5 shrink-0", selected ? "text-brand-500" : "text-slate-400")} aria-hidden />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                  <span className="block text-xs text-slate-500">{option.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Button type="submit" variant="accent" size="lg" className="mt-6 w-full" disabled={!role} loading={loading}>
          Create account
        </Button>
      </form>
      <AuthLegalLinks />
    </div>
  );
}
