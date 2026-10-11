import * as React from "react";
import { cn } from "@/lib/utils";

const tones = {
  default: "glass",
  strong: "glass-strong",
  soft: "glass-soft",
  dark: "glass-dark",
} as const;

export function GlassPanel({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: keyof typeof tones }) {
  return <div className={cn("rounded-2xl", tones[tone], className)} {...props} />;
}
