import * as React from "react";
import Link from "@/components/link";
import { Heart } from "lucide-react";
import { api } from "@/services/api";
import type { SpaceSummary } from "@/types";
import { ParkingCard } from "@/components/parking-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export default function SavedPage() {
  const [spaces, setSpaces] = React.useState<SpaceSummary[] | null>(null);

  React.useEffect(() => {
    document.title = "Saved parking · Place2Park";
    api.get("/favorites").then(({ data }) => setSpaces(data.data.spaces)).catch(() => setSpaces([]));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
          Saved parking
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Spaces you&apos;ve bookmarked for quick rebooking.
        </p>
      </div>
      {spaces === null ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      ) : spaces.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any parking space to keep it handy here."
          action={
            <Link href="/search">
              <Button variant="accent">Browse parking</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((s) => (
            <ParkingCard key={s.id} space={s} />
          ))}
        </div>
      )}
    </div>
  );
}
