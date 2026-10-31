import Link from "@/components/link";
import { cn } from "@/lib/utils";

/** Place2Park wordmark. */
export function Logo({ className, dark }: { className?: string; dark?: boolean }) {
  return (
    <Link
      href="/"
      className={cn("inline-flex items-center gap-2 font-display", className)}
      aria-label="Place2Park home"
    >
      <span className={cn("text-[17px] font-bold tracking-tight sm:text-[19px]", dark ? "text-white" : "text-ink")}>
        Place2Park
      </span>
    </Link>
  );
}
