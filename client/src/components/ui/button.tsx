import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-brand-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_20px_-8px_rgba(15,99,83,0.55)] hover:bg-brand-800 active:bg-brand-900 disabled:bg-brand-700/50",
  secondary:
    "glass-chip text-slate-800 hover:bg-white/80 active:bg-white/90 disabled:opacity-50",
  ghost: "text-slate-700 hover:bg-white/45 active:bg-white/60 disabled:opacity-50",
  danger:
    "bg-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)] hover:bg-red-700 active:bg-red-800 disabled:bg-red-600/50",
  "danger-outline":
    "glass-chip text-red-600 hover:bg-red-50/80 active:bg-red-100/80 disabled:opacity-50",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-base gap-2 rounded-xl",
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
        "inline-flex items-center justify-center font-medium transition-[background-color,box-shadow,transform] duration-150 select-none disabled:cursor-not-allowed",
        "motion-safe:active:scale-[0.98]",
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
