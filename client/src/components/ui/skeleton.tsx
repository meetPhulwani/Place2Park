import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-line", className)} />;
}

export function ParkingCardSkeleton() {
  return (
    <div className="flex min-h-[156px] items-center overflow-hidden rounded-xl border border-line bg-white sm:min-h-[164px]">
      <div className="flex w-[44%] shrink-0 items-center p-1 sm:w-[45%] sm:p-1.5">
        <Skeleton className="aspect-[3/2] w-full max-h-[156px] rounded-lg" />
      </div>
      <div className="flex flex-1 flex-col justify-between p-3">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line bg-white p-4">
      <Skeleton className="size-14 rounded-lg" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-20" />
    </div>
  );
}
