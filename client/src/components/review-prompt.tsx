import * as React from "react";
import { api, errorMessage } from "@/services/api";
import { reviewGateMessage } from "@/lib/review-flow";
import { ReviewForm } from "./review-form";

type PendingReview = {
  id: string;
  bookingId: string;
  authorRole: "DRIVER" | "HOST";
  spaceTitle: string;
  prompt: string;
};

type PendingPayload = {
  requests: PendingReview[];
  skipCount: number;
  skipsRemaining: number;
  blocked: boolean;
};

export function ReviewPrompt() {
  const [data, setData] = React.useState<PendingPayload | null>(null);
  const [hidden, setHidden] = React.useState(false);

  const load = React.useCallback(() => {
    api
      .get("/reviews/pending")
      .then(({ data: body }) => setData(body.data as PendingPayload))
      .catch(() => setData(null));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const current = data?.requests[0];
  if (!current || hidden) return null;
  const request = current;
  const allowSkip = (data?.skipsRemaining ?? 0) > 0;

  async function skip() {
    try {
      const { data: body } = await api.post(`/reviews/pending/${request.id}/skip`);
      setData((prev) => (prev ? { ...prev, ...body.data, requests: prev.requests } : prev));
      setHidden(true);
    } catch (err) {
      setData((prev) => (prev ? { ...prev, skipsRemaining: 0, blocked: true } : prev));
      setHidden(false);
      return errorMessage(err);
    }
  }

  return (
    <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-labelledby="review-prompt-title">
      <div className="flex items-start justify-between gap-3">
        <h2 id="review-prompt-title" className="font-display text-lg font-semibold text-slate-900">
          {current.prompt}
        </h2>
        <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={() => setHidden(true)}>
          Close
        </button>
      </div>
      {data?.blocked && (
        <p className="mt-2 text-sm text-slate-700" role="status">
          {reviewGateMessage(true)}
        </p>
      )}
      <div className="mt-3">
        <ReviewForm
          bookingId={current.bookingId}
          role={current.authorRole}
          spaceTitle={current.spaceTitle}
          allowSkip={allowSkip}
          showPrompt={false}
          onDone={load}
          onSkip={() => void skip()}
        />
      </div>
    </section>
  );
}
