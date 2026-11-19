import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import * as Linking from "expo-linking";
import { fetchFavorites, searchParking } from "../../../src/api/parking";
import { ListingCard } from "../../../src/components/seeker/listing-card";
import { Chip, EmptyState, ErrorState, Screen, SearchBar, SkeletonBlock } from "../../../src/components/seeker/ui";
import { colors } from "../../../src/constants/theme";
import { greeting, homeSections, listPhase } from "../../../src/lib/listings";
import { searchQuery } from "../../../src/lib/search";
import { useAuth } from "../../../src/services/auth-context";
import { useApiClient } from "../../../src/services/api";
import { readCurrentLocation } from "../../../src/services/device-location";
import { useExpireSession } from "../../../src/services/query";

export default function ExploreScreen() {
  const { state } = useAuth();
  const api = useApiClient();
  const [place, setPlace] = useState<{ lat: number; lng: number; label: string } | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [canOpenSettings, setCanOpenSettings] = useState(false);
  const name = state.status === "signed-in" ? state.user.name : "";

  const nearby = useQuery({
    queryKey: ["nearby", place?.lat, place?.lng],
    enabled: place != null,
    queryFn: () => searchParking(api, searchQuery({ lat: place?.lat, lng: place?.lng, sort: "closest" })),
  });
  const saved = useQuery({ queryKey: ["favorites"], queryFn: () => fetchFavorites(api) });
  useExpireSession(nearby.error ?? saved.error);

  async function chooseCurrentLocation() {
    setLocating(true);
    setLocationMessage(null);
    const result = await readCurrentLocation();
    setLocating(false);
    if (!result.ok) {
      setCanOpenSettings(result.access === "blocked");
      setLocationMessage(result.message);
      return;
    }
    setCanOpenSettings(false);
    setPlace({ lat: result.lat, lng: result.lng, label: "Current location" });
  }

  const sections = homeSections(nearby.data?.results ?? [], saved.data ?? []);
  const nearbyPhase = place == null ? "idle" : listPhase(nearby.isPending ? "pending" : nearby.isError ? "error" : "success", sections.nearby.length);

  return (
    <Screen scroll>
      <Text style={styles.brand}>Place2Park</Text>
      <Text style={styles.greeting}>{greeting(name, new Date().getHours())}</Text>
      <Text style={styles.place}>{place?.label ?? "Choose where you want to park"}</Text>
      <SearchBar label="Search an area or neighbourhood" onPress={() => router.push("/(app)/search" as Href)} />
      <View style={styles.row}>
        <Chip label={locating ? "Finding you" : "Current location"} onPress={() => void chooseCurrentLocation()} />
        <Chip label="Car" onPress={() => openVehicle("CAR")} />
        <Chip label="Bike" onPress={() => openVehicle("BIKE")} />
      </View>
      {locationMessage ? <Text style={styles.note}>{locationMessage}</Text> : null}
      {canOpenSettings ? (
        <Pressable accessibilityRole="button" onPress={() => void Linking.openSettings()} style={styles.settings}>
          <Text style={styles.settingsLabel}>Open location settings</Text>
        </Pressable>
      ) : null}

      <Text style={styles.section}>Nearby</Text>
      {nearbyPhase === "idle" ? <EmptyState title="Parking near you" body="Use your current location, or search an area. Results come from the Place2Park listings." /> : null}
      {nearbyPhase === "loading" ? <SkeletonBlock /> : null}
      {nearbyPhase === "error" ? <ErrorState message="Nearby parking could not be loaded." onRetry={() => void nearby.refetch()} /> : null}
      {nearbyPhase === "empty" ? <EmptyState title="No parking nearby" body="Try a wider search or another area." /> : null}
      {nearbyPhase === "results"
        ? sections.nearby.map((space) => (
            <ListingCard key={space.id} space={space} onPress={() => router.push(`/(app)/listing/${space.id}` as Href)} />
          ))
        : null}

      {sections.recommended.length > 0 ? (
        <>
          <Text style={styles.section}>Highly rated nearby</Text>
          {sections.recommended.map((space) => (
            <ListingCard key={space.id} space={space} onPress={() => router.push(`/(app)/listing/${space.id}` as Href)} />
          ))}
        </>
      ) : null}

      {sections.saved.length > 0 ? (
        <>
          <Text style={styles.section}>Saved</Text>
          {sections.saved.map((space) => (
            <ListingCard key={space.id} space={space} saved onPress={() => router.push(`/(app)/listing/${space.id}` as Href)} />
          ))}
        </>
      ) : null}
    </Screen>
  );

  function openVehicle(vehicleType: "CAR" | "BIKE") {
    router.push({
      pathname: "/(app)/results",
      params: {
        vehicleType,
        ...(place ? { lat: String(place.lat), lng: String(place.lng), label: place.label } : {}),
      },
    } as unknown as Href);
  }
}

const styles = StyleSheet.create({
  brand: { color: colors.blue, fontSize: 16, fontWeight: "800" },
  greeting: { color: colors.midnight, fontSize: 30, fontWeight: "800" },
  place: { color: colors.muted, fontSize: 15 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  note: { color: colors.midnight, fontSize: 14, lineHeight: 20 },
  settings: { minHeight: 44, justifyContent: "center" },
  settingsLabel: { color: colors.blue, fontWeight: "700" },
  section: { color: colors.midnight, fontSize: 20, fontWeight: "800", marginTop: 8 },
});
