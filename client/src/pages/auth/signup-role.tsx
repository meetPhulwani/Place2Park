import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftRight, Building2, Car } from "lucide-react";
import Link from "@/components/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const roles = [
  { value: "DRIVER", label: "Find parking", desc: "I need places to park", icon: Car },
  { value: "HOST", label: "List parking", desc: "I have space to rent out", icon: Building2 },
  { value: "BOTH", label: "Both", desc: "Park and earn", icon: ArrowLeftRight },
] as const;

export type SignupRole = (typeof roles)[number]["value"];

export default function SignupRolePage() {
  const navigate = useNavigate();
  const [role, setRole] = React.useState<SignupRole | null>(null);

  React.useEffect(() => {
    document.title = "Create your account · Place2Park";
  }, []);

  return (
    <div className="animate-fade-in">
      <h1 className="font-display text-2xl font-bold tracking-tight text-brand-500">
        Create your account
      </h1>
      <p className="mt-1.5 text-sm text-slate-500">Choose how you'll use Place2Park.</p>

      <div className="mt-6 space-y-2" role="radiogroup" aria-label="Account type">
        {roles.map((option) => {
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
              <option.icon
                className={cn("size-5 shrink-0", selected ? "text-brand-500" : "text-slate-400")}
                aria-hidden
              />
              <span>
                <span className="block text-sm font-semibold text-slate-800">{option.label}</span>
                <span className="block text-xs text-slate-500">{option.desc}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="accent"
        size="lg"
        className="mt-6 w-full"
        disabled={!role}
        onClick={() => role && navigate("/signup/account", { state: { role } })}
      >
        Continue
      </Button>

      <p className="mt-6 text-center text-sm text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
          Log in
        </Link>
      </p>
    </div>
  );
}
