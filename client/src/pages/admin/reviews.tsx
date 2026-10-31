import * as React from "react";
import Link from "@/components/link";
import { Star } from "lucide-react";
import { api } from "@/services/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";

interface AdminReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  userId: { name?: string; email?: string } | null;
  spaceId: { id: string; title: string } | null;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = React.useState<AdminReview[] | null>(null);

  React.useEffect(() => {
    document.title = "Reviews — Admin · Place2Park";
    api.get("/admin/reviews").then(({ data }) => setReviews(data.data.reviews)).catch(() => setReviews([]));
  }, []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Reviews</h1>
        <p className="mt-1 text-sm text-slate-500">
          Latest reviews across all listings. Reviews come only from completed bookings.
        </p>
      </div>
      {reviews === null ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : reviews.length === 0 ? (
        <EmptyState icon={Star} title="No reviews yet" />
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="glass rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                    <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
                    {r.rating}/5
                  </span>
                  <span className="text-slate-400">·</span>
                  {r.spaceId && (
                    <Link href={`/parking/${r.spaceId.id}`} className="font-medium text-brand-700 hover:text-brand-800">
                      {r.spaceId.title}
                    </Link>
                  )}
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(r.createdAt)}</span>
              </div>
              {r.comment && <p className="mt-2 text-sm text-slate-600">“{r.comment}”</p>}
              <p className="mt-1.5 text-xs text-slate-400">
                by {r.userId?.name} ({r.userId?.email})
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
