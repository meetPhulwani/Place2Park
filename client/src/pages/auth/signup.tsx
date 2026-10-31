import * as React from "react";
import Link from "@/components/link";
import { useLocation, useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { api, errorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { GoogleButton } from "@/components/google-button";
import { saveEmailOtpChallenge } from "@/lib/google-auth";
import type { SignupRole } from "@/pages/auth/signup-role";

const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

const PASSWORD_MESSAGE =
  "Use at least 8 characters with one uppercase letter, one number, and one special character.";

const ROLE_LABEL: Record<SignupRole, string> = {
  DRIVER: "Find parking",
  HOST: "List parking",
  BOTH: "Both",
};

function isSignupRole(value: unknown): value is SignupRole {
  return value === "DRIVER" || value === "HOST" || value === "BOTH";
}

function passwordIssue(password: string) {
  if (
    password.length < 8 ||
    password.length > 100 ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password) ||
    !/[^A-Za-z0-9\s]/.test(password)
  ) {
    return PASSWORD_MESSAGE;
  }
  return null;
}

function isIndianMobile(input: string) {
  const digits = input.replace(/\D/g, "");
  let local = digits;
  if (digits.length === 12 && digits.startsWith("91")) local = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) local = digits.slice(1);
  return /^[6-9]\d{9}$/.test(local);
}

export default function SignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const chosen = (location.state as { role?: unknown } | null)?.role;
  const role = isSignupRole(chosen) ? chosen : null;
  const [form, setForm] = React.useState({ name: "", email: "", password: "", phone: "" });
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    document.title = "Sign up · Place2Park";
  }, []);

  React.useEffect(() => {
    if (!role) navigate("/signup", { replace: true });
  }, [navigate, role]);

  function fieldErrorsFrom(e2: unknown) {
    const fieldErrors =
      e2 instanceof AxiosError
        ? ((e2.response?.data as { errors?: Record<string, string[]> })?.errors ?? null)
        : null;
    if (!fieldErrors) return null;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(fieldErrors)) if (v?.[0]) flat[k] = v[0];
    return flat;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const next: Record<string, string> = {};
    if (form.name.trim().length < 2) next.name = "Enter your name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Enter a valid email.";
    const passwordError = passwordIssue(form.password);
    if (passwordError) next.password = passwordError;
    if (form.password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    if (!isIndianMobile(form.phone)) next.phone = "Enter a valid 10-digit mobile number.";
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const { data } = await api.post("/auth/signup", { ...form, role });
      saveEmailOtpChallenge(data.data);
      navigate("/signup/verify-email");
    } catch (e2) {
      const status = e2 instanceof AxiosError ? e2.response?.status : null;
      if (status === 409 && /email or password/i.test(errorMessage(e2, ""))) {
        setFormError("Invalid email or password.");
        return;
      }
      const flat = fieldErrorsFrom(e2);
      if (flat && Object.keys(flat).length) setErrors(flat);
      else setFormError(errorMessage(e2, "Couldn't create your account."));
    } finally {
      setLoading(false);
    }
  }

  if (!role) return null;

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-500">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">
        {ROLE_LABEL[role]}.{" "}
        <button
          type="button"
          className="font-medium text-brand-700 hover:text-brand-800"
          onClick={() => navigate("/signup")}
        >
          Change
        </button>
      </p>
      {formError && (
        <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {formError}
        </p>
      )}

      <div className="mt-6 space-y-4">
        {googleEnabled && (
          <>
            <GoogleButton />
            <div className="flex items-center gap-3">
              <span className="h-px flex-1 bg-slate-200" />
              <span className="text-xs text-slate-400">or with email</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
          </>
        )}
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="name">Full name</Label>
            <Input
              id="name"
              autoComplete="name"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Aarav Mehta"
            />
            <FieldError error={errors.name} />
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="you@example.com"
            />
            <FieldError error={errors.email} />
          </div>
          <div>
            <Label htmlFor="phone">Contact number</Label>
            <Input
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="9876543210"
            />
            <FieldError error={errors.phone} />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
            />
            <p className="mt-1.5 text-xs text-slate-500">{PASSWORD_MESSAGE}</p>
            <FieldError error={errors.password} />
          </div>
          <div>
            <Label htmlFor="confirm-password">Re-enter password</Label>
            <PasswordInput
              id="confirm-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <FieldError error={errors.confirmPassword} />
          </div>
          <Button type="submit" variant="accent" size="lg" className="w-full" loading={loading}>
            Create account
          </Button>
        </form>
      </div>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>
    </div>
  );
}
