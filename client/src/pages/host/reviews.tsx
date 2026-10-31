import * as React from "react";
import { Star } from "lucide-react";
import { api } from "@/services/api";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewCard } from "@/components/review-card";
import { Rating } from "@/components/ui/rating";

interface HostReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  userId: { name: string | null; image: string | null } | null;
  spaceId: { title: string } | null;
}

export default function HostReviewsPage() {
  const [reviews, setReviews] = React.useState<HostReview[] | null>(null);

  React.useEffect(() => {
    document.title = "Reviews · Place2Park";
    api.get("/host/reviews").then(({ data }) => setReviews(data.data.reviews)).catch(() => setReviews([]));
  }, []);

  if (reviews === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-2xl" />
          <Skeleton className="h-36 rounded-2xl" />
        </div>
      </div>
    );
  }

  const avg = reviews.length > 0 ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">Reviews</h1>
          <p className="mt-1 text-sm text-slate-500">
            What drivers say after parking at your spaces.
          </p>
        </div>
        {reviews.length > 0 && <Rating value={avg} count={reviews.length} size={18} />}
      </div>
      {reviews.length === 0 ? (
        <EmptyState
          icon={Star}
          title="No reviews yet"
          description="Drivers can review after completing a booking. Great access instructions earn great ratings."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {reviews.map((r) => (
            <div key={r.id}>
              <p className="mb-1.5 truncate text-xs font-medium uppercase tracking-wider text-slate-400">
                {r.spaceId?.title}
              </p>
              <ReviewCard
                review={{
                  id: r.id,
                  rating: r.rating,
                  comment: r.comment,
                  createdAt: r.createdAt,
                  user: r.userId ?? undefined,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
