import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchFavorites, searchParking, toggleFavorite } from "../../src/api/parking";
import { Button } from "../../src/components/button";
import { Field } from "../../src/components/field";
import { ListingCard } from "../../src/components/seeker/listing-card";
import { ParkingMap } from "../../src/components/seeker/parking-map";
import { Chip, EmptyState, ErrorState, Header, Screen, Sheet, SkeletonBlock, ViewToggle } from "../../src/components/seeker/ui";
import { listPhase, markersFor, selectedListing } from "../../src/lib/listings";
import { applyReturnedSort, draftFromParams, searchQuery } from "../../src/lib/search";
import type { SearchDraft } from "../../src/types/listing";
import { useApiClient } from "../../src/services/api";
import { useExpireSession } from "../../src/services/query";

function one(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default function ResultsScreen() {
  const raw = useLocalSearchParams();
  const params = {
    q: one(raw.q),
    lat: one(raw.lat),
    lng: one(raw.lng),
    label: one(raw.label),
    maxPrice: one(raw.maxPrice),
    maxDistanceKm: one(raw.maxDistanceKm),
    covered: one(raw.covered),
    ev: one(raw.ev),
    vehicleType: one(raw.vehicleType),
    minRating: one(raw.minRating),
    sort: one(raw.sort),
    start: one(raw.start),
    durationMins: one(raw.durationMins),
  };
  const draft = draftFromParams(params);
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"list" | "map">("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = searchQuery(draft);
  const results = useQuery({
    queryKey: ["search", query],
    queryFn: ({ signal }) => searchParking(api, query, signal),
  });
  const saved = useQuery({ queryKey: ["favorites"], queryFn: () => fetchFavorites(api) });
  useExpireSession(results.error ?? saved.error);
  const save = useMutation({
    mutationFn: (spaceId: string) => toggleFavorite(api, spaceId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });
  const ordered = applyReturnedSort(results.data?.results ?? [], draft.sort);
  const phase = listPhase(results.isPending ? "pending" : results.isError ? "error" : "success", ordered.length);
  const selected = selectedListing(ordered, selectedId);
  const savedIds = new Set((saved.data ?? []).map((space) => space.id));

  function apply(next: Partial<SearchDraft>) {
    const merged = { ...draft, ...next };
    router.setParams({
      q: merged.q ?? "",
      lat: merged.lat != null ? String(merged.lat) : "",
      lng: merged.lng != null ? String(merged.lng) : "",
      label: merged.label ?? "",
      maxPrice: merged.maxPrice != null ? String(merged.maxPrice) : "",
      maxDistanceKm: merged.maxDistanceKm != null ? String(merged.maxDistanceKm) : "",
      covered: merged.covered ? "true" : "",
      ev: merged.ev ? "true" : "",
      vehicleType: merged.vehicleType ?? "",
      minRating: merged.minRating != null ? String(merged.minRating) : "",
      sort: merged.sort ?? "",
      start: merged.start ?? "",
      durationMins: merged.durationMins != null ? String(merged.durationMins) : "",
    });
  }

  return (
    <Screen>
      <Header title={draft.label || draft.q || "Parking"} subtitle="Same listings as the Place2Park search." onBack={() => router.back()} />
      <View style={styles.toolbar}>
        <ViewToggle mode={mode} onChange={setMode} />
        <Chip label="Filters" selected={filtersOpen} onPress={() => setFiltersOpen(true)} />
      </View>
      {phase === "loading" ? <View style={styles.pad}><SkeletonBlock /></View> : null}
      {phase === "error" ? <View style={styles.pad}><ErrorState message="Parking search could not be loaded." onRetry={() => void results.refetch()} /></View> : null}
      {phase === "empty" ? <View style={styles.pad}><EmptyState title="No parking found" body="Try another area, or clear a filter." /></View> : null}
      {phase === "results" && mode === "list" ? (
        <ScrollView contentContainerStyle={styles.list}>
          {ordered.map((space) => (
            <ListingCard
              key={space.id}
              space={space}
              selected={space.id === selectedId}
              saved={savedIds.has(space.id)}
              onPress={() => {
                setSelectedId(space.id);
                router.push({ pathname: "/(app)/listing/[id]", params: { id: space.id } } as unknown as Href);
              }}
              onToggleSaved={() => save.mutate(space.id)}
            />
          ))}
        </ScrollView>
      ) : null}
      {phase === "results" && mode === "map" ? (
        <View style={styles.mapWrap}>
          <ParkingMap markers={markersFor(ordered)} center={results.data?.center ?? null} onSelect={setSelectedId} />
          {selected ? (
            <View style={styles.preview}>
              <ListingCard space={selected} selected saved={savedIds.has(selected.id)} onPress={() => router.push({ pathname: "/(app)/listing/[id]", params: { id: selected.id } } as unknown as Href)} onToggleSaved={() => save.mutate(selected.id)} />
            </View>
          ) : null}
        </View>
      ) : null}
      <FilterSheet visible={filtersOpen} draft={draft} onClose={() => setFiltersOpen(false)} onApply={apply} />
    </Screen>
  );
}

function FilterSheet({
  visible,
  draft,
  onClose,
  onApply,
}: {
  visible: boolean;
  draft: SearchDraft;
  onClose: () => void;
  onApply: (next: Partial<SearchDraft>) => void;
}) {
  const [maxPrice, setMaxPrice] = useState(draft.maxPrice != null ? String(draft.maxPrice) : "");
  return (
    <Sheet visible={visible} title="Filters" onClose={onClose}>
      <Field label="Maximum price per hour (₹)" value={maxPrice} onChangeText={setMaxPrice} keyboardType="number-pad" />
      <Text style={styles.filterLabel}>Sort</Text>
      <View style={styles.wrap}>
        <Chip label="Closest" selected={!draft.sort || draft.sort === "closest"} onPress={() => onApply({ sort: "closest" })} />
        <Chip label="Price: low to high" selected={draft.sort === "cheapest"} onPress={() => onApply({ sort: "cheapest" })} />
        <Chip label="Price: high to low" selected={draft.sort === "highest-price"} onPress={() => onApply({ sort: "highest-price" })} />
        <Chip label="Rating" selected={draft.sort === "rating"} onPress={() => onApply({ sort: "rating" })} />
      </View>
      <View style={styles.wrap}>
        <Chip label="Covered" selected={draft.covered} onPress={() => onApply({ covered: !draft.covered })} />
        <Chip label="EV charging" selected={draft.ev} onPress={() => onApply({ ev: !draft.ev })} />
        <Chip label="Car" selected={draft.vehicleType === "CAR"} onPress={() => onApply({ vehicleType: draft.vehicleType === "CAR" ? undefined : "CAR" })} />
        <Chip label="Bike" selected={draft.vehicleType === "BIKE"} onPress={() => onApply({ vehicleType: draft.vehicleType === "BIKE" ? undefined : "BIKE" })} />
        <Chip label="4+ rating" selected={draft.minRating === 4} onPress={() => onApply({ minRating: draft.minRating === 4 ? undefined : 4 })} />
        <Chip label="Within 5 km" selected={draft.maxDistanceKm === 5} onPress={() => onApply({ maxDistanceKm: draft.maxDistanceKm === 5 ? undefined : 5 })} />
        <Chip
          label="Next hour"
          selected={draft.durationMins === 60}
          onPress={() =>
            onApply(
              draft.durationMins === 60
                ? { start: undefined, durationMins: undefined }
                : { start: new Date().toISOString(), durationMins: 60 }
            )
          }
        />
      </View>
      <Button
        label="Apply price"
        onPress={() => {
          const value = Number(maxPrice);
          onApply({ maxPrice: maxPrice.trim() && Number.isFinite(value) ? value : undefined });
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 8 },
  pad: { paddingHorizontal: 20 },
  list: { paddingHorizontal: 20, paddingBottom: 32, gap: 12 },
  mapWrap: { flex: 1 },
  preview: { position: "absolute", left: 16, right: 16, bottom: 16 },
  filterLabel: { fontWeight: "700" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
