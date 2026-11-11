import { lazy, Suspense, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function RouteFallback() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-6" role="status" aria-live="polite">
      <span className="sr-only">Loading</span>
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

/** Loads a route after the shell. The fallback stays inside the current layout. */
export function lazyRoute(
  loader: () => Promise<{ default: ComponentType }>,
  Fallback: ComponentType = RouteFallback,
) {
  const Page = lazy(loader);
  return function LazyRoute() {
    return (
      <Suspense fallback={<Fallback />}>
        <Page />
      </Suspense>
    );
  };
}
