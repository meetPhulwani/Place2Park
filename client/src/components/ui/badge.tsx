import * as React from "react";
import { cn } from "@/lib/utils";

const styles = {
  neutral: "border border-line bg-mist-50 text-ink",
  brand: "border border-brand-200 bg-brand-50 text-brand-700",
  volt: "border border-volt-dark/40 bg-volt text-ink",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border border-amber-200 bg-amber-50 text-amber-800",
  danger: "border border-red-200 bg-red-50 text-red-700",
  info: "border border-mist bg-mist-50 text-slate-700",
  outline: "border border-line bg-white text-muted",
} as const;

export function Badge({
  className,
  variant = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
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
