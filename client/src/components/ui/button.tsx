import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-brand-500 text-white shadow-sm hover:bg-brand-600 active:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:bg-brand-500/45 disabled:text-white/80",
  accent:
    "bg-volt text-ink shadow-sm hover:bg-volt-dark active:bg-volt-darker focus-visible:ring-2 focus-visible:ring-volt/70 disabled:bg-volt/45 disabled:text-ink/50",
  secondary:
    "border border-brand-500 bg-white text-brand-600 hover:bg-brand-50 active:bg-brand-100 disabled:border-mist disabled:text-muted disabled:opacity-60",
  ghost: "text-muted hover:bg-brand-50 hover:text-brand-700 active:bg-brand-100 disabled:opacity-50",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50",
  "danger-outline":
    "border border-red-200 bg-white text-red-600 hover:bg-red-50 active:bg-red-100 disabled:opacity-50",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-lg",
} as const;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-colors duration-200 select-none focus-visible:outline-none disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
