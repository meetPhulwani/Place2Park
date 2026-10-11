import Link from "@/components/link";
import { cn } from "@/lib/utils";

/** Parkly wordmark — intentionally simple so it can be swapped later. */
export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 font-display", className)}
      aria-label="Parkly home"
    >
      <span className="flex size-8 items-center justify-center rounded-xl bg-brand-700 text-[17px] font-bold text-white">
        P
      </span>
      <span className={cn("text-[19px] font-bold tracking-tight", dark ? "text-white" : "text-slate-900")}>
        parkly
      </span>
    </Link>
  );
}
