import { router, type Href } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFavorites, toggleFavorite } from "../../../src/api/parking";
import { ListingCard } from "../../../src/components/seeker/listing-card";
import { Header, Screen, EmptyState, ErrorState, SkeletonBlock } from "../../../src/components/seeker/ui";
import { listPhase } from "../../../src/lib/listings";
import { useApiClient } from "../../../src/services/api";
import { useExpireSession } from "../../../src/services/query";

export default function SavedScreen() {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const saved = useQuery({ queryKey: ["favorites"], queryFn: () => fetchFavorites(api) });
  useExpireSession(saved.error);
  const remove = useMutation({
    mutationFn: (spaceId: string) => toggleFavorite(api, spaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });
  const phase = listPhase(saved.isPending ? "pending" : saved.isError ? "error" : "success", saved.data?.length ?? 0);

  return (
    <Screen scroll>
      <Header title="Saved" />
      {phase === "loading" ? <SkeletonBlock /> : null}
      {phase === "error" ? <ErrorState message="Saved parking could not be loaded." onRetry={() => void saved.refetch()} /> : null}
      {phase === "empty" ? <EmptyState title="No saved parking" body="Save a listing from search and it will stay on your Place2Park account." /> : null}
      {phase === "results"
        ? saved.data?.map((space) => (
            <ListingCard
              key={space.id}
              space={space}
              saved
              onPress={() => router.push(`/(app)/listing/${space.id}` as Href)}
              onToggleSaved={() => remove.mutate(space.id)}
            />
          ))
        : null}
    </Screen>
  );
}
