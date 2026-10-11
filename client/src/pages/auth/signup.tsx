import * as React from "react";
import Link from "@/components/link";
import { useNavigate } from "react-router-dom";
import { AxiosError } from "axios";
import { Car, Building2, ArrowLeftRight } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { GoogleButton } from "@/components/google-button";
import { cn } from "@/lib/utils";

const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

const roleOptions = [
  { value: "DRIVER", label: "Find parking", desc: "I need places to park", icon: Car },
  { value: "HOST", label: "List parking", desc: "I have space to rent out", icon: Building2 },
  { value: "BOTH", label: "Both", desc: "Park and earn", icon: ArrowLeftRight },
] as const;

export default function SignupPage() {
  const navigate = useNavigate();
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "DRIVER" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    document.title = "Sign up · Parkly";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    setLoading(true);
    try {
      await api.post("/auth/signup", form);
      navigate("/login?registered=1");
    } catch (e2) {
      const fieldErrors =
        e2 instanceof AxiosError
          ? ((e2.response?.data as { errors?: Record<string, string[]> })?.errors ?? null)
          : null;
      if (fieldErrors) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(fieldErrors)) if (v?.[0]) flat[k] = v[0];
        setErrors(flat);
      } else {
        setFormError(errorMessage(e2, "Couldn't create your account."));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">Free to join. Takes under a minute.</p>

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
          <fieldset>
            <legend className="mb-1.5 block text-sm font-medium text-slate-700">
              I want to…
            </legend>
            <div className="grid grid-cols-3 gap-2">
              {roleOptions.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  aria-pressed={form.role === r.value}
                  onClick={() => setForm((f) => ({ ...f, role: r.value }))}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition-all",
                    form.role === r.value
                      ? "border-brand-600 bg-brand-50/80 ring-1 ring-brand-600 backdrop-blur-md"
                      : "glass-chip hover:bg-white/70"
                  )}
                >
                  <r.icon
                    className={cn(
                      "size-5",
                      form.role === r.value ? "text-brand-700" : "text-slate-400"
                    )}
                    aria-hidden
                  />
                  <span className="text-xs font-semibold text-slate-800">{r.label}</span>
                  <span className="text-[10px] leading-tight text-slate-400">{r.desc}</span>
                </button>
              ))}
            </div>
          </fieldset>
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
            <Label htmlFor="password" hint="(min. 8 characters)">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
            />
            <FieldError error={errors.password} />
          </div>
          <FieldError error={formError ?? undefined} />
          <Button type="submit" size="lg" className="w-full" loading={loading}>
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
