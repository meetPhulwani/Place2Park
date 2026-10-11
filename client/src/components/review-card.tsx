import { Star } from "lucide-react";
import { Avatar } from "./ui/avatar";
import { formatDate } from "@/lib/utils";

export function ReviewCard({
  review,
}: {
  review: {
    id: string;
    rating: number;
    comment: string;
    createdAt: Date | string;
    user?: { name: string | null; image: string | null };
  };
}) {
  return (
    <article className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={review.user?.name} image={review.user?.image} size={36} />
          <div>
            <p className="text-sm font-semibold text-slate-900">{review.user?.name ?? "Driver"}</p>
            <p className="text-xs text-slate-400">{formatDate(review.createdAt)}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-sm font-medium text-slate-800">
          <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden />
          {review.rating}
        </span>
      </div>
      {review.comment && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{review.comment}</p>
      )}
    </article>
  );
}
