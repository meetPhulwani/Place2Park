import * as React from "react";
import { cn } from "@/lib/utils";

const styles = {
  neutral: "glass-chip text-slate-700",
  brand: "border border-brand-200/70 bg-brand-50/80 text-brand-800 backdrop-blur-md",
  success: "border border-emerald-200/70 bg-emerald-50/80 text-emerald-700 backdrop-blur-md",
  warning: "border border-amber-200/70 bg-amber-50/80 text-amber-800 backdrop-blur-md",
  danger: "border border-red-200/70 bg-red-50/80 text-red-700 backdrop-blur-md",
  info: "border border-sky-200/70 bg-sky-50/80 text-sky-700 backdrop-blur-md",
  outline: "glass-chip text-slate-600",
} as const;

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}

const bookingStatusVariant: Record<string, keyof typeof styles> = {
  PENDING: "warning",
  CONFIRMED: "brand",
  ACTIVE: "success",
  COMPLETED: "neutral",
  CANCELLED: "danger",
  EXPIRED: "outline",
};

export function BookingStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    PENDING: "Payment pending",
    CONFIRMED: "Confirmed",
    ACTIVE: "In progress",
    COMPLETED: "Completed",
    CANCELLED: "Cancelled",
    EXPIRED: "Expired",
  };
  return <Badge variant={bookingStatusVariant[status] ?? "neutral"}>{labels[status] ?? status}</Badge>;
}

const spaceStatusVariant: Record<string, keyof typeof styles> = {
  DRAFT: "outline",
  PENDING_REVIEW: "warning",
  VERIFIED: "success",
  ACTIVE: "success",
  PAUSED: "neutral",
  REJECTED: "danger",
  HIDDEN: "danger",
};

export function SpaceStatusBadge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    PENDING_REVIEW: "In review",
    VERIFIED: "Verified",
    ACTIVE: "Active",
    PAUSED: "Paused",
    REJECTED: "Rejected",
    HIDDEN: "Hidden",
  };
  return <Badge variant={spaceStatusVariant[status] ?? "neutral"}>{labels[status] ?? status}</Badge>;
}
