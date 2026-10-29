import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "border-line bg-white shadow-card",
  strong: "border-line bg-white shadow-card",
  soft: "border-line bg-page",
  dark: "border-slate-700 bg-ink text-white",
} as const;

export function GlassPanel({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div className={cn("rounded-xl border", tones[tone], className)} {...props} />;
}
