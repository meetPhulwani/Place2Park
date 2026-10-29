import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export function DashboardLoadError({
  description = "We couldn't load this dashboard. Check your connection and try again.",
  onRetry,
}: {
  description?: string;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      icon={AlertCircle}
      title="Couldn't load dashboard"
      description={description}
      action={
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      }
    />
  );
}
