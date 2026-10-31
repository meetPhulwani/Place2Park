import * as React from "react";
import Link from "@/components/link";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { Button } from "@/components/ui/button";
import { Input, Label, FieldError } from "@/components/ui/input";
import { toast } from "@/components/ui/toaster";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    document.title = "Set a new password · Place2Park";
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated — log in with your new password.");
      navigate("/login");
    } catch (e2) {
      setError(errorMessage(e2, "This reset link is invalid or has expired."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
        Set a new password
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">Choose a strong password you haven't used before.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password" hint="(min. 8 characters)">
            New password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <FieldError error={error ?? undefined} />
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          Update password
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
          ← Back to login
        </Link>
      </p>
    </div>
  );
}
