import * as React from "react";
import { Heart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "@/services/api";
import { toast } from "./ui/toaster";
import { cn } from "@/lib/utils";

export function FavoriteButton({
  spaceId,
  initialSaved,
  loggedIn,
  className,
}: {
  spaceId: string;
  initialSaved: boolean;
  loggedIn: boolean;
  className?: string;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = React.useState(initialSaved);
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (!loggedIn) {
      navigate(`/login?next=/parking/${spaceId}`);
      return;
    }
    setBusy(true);
    const optimistic = !saved;
    setSaved(optimistic);
    try {
      const { data } = await api.post("/favorites/toggle", { spaceId });
      toast.success(data.data.favorited ? "Saved to your list." : "Removed from saved.");
    } catch (e) {
      setSaved(!optimistic);
      toast.error(errorMessage(e, "Couldn't update saved spaces."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Remove from saved" : "Save this parking space"}
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60",
        className
      )}
    >
      <Heart className={cn("size-4", saved && "fill-red-500 text-red-500")} aria-hidden />
      {saved ? "Saved" : "Save"}
    </button>
  );
}
