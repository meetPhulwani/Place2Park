import type { ReactNode } from "react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";

export function DashboardSection({
  id,
  title,
  href,
  hrefLabel = "View all",
  children,
  className,
}: {
  id: string;
  title: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={id} className="text-base font-semibold text-ink">
          {title}
        </h2>
        {href && (
          <Link href={href} className="text-sm font-medium text-brand-600 hover:text-brand-800">
            {hrefLabel}
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
