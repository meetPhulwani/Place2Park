import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchListing, toggleFavorite } from "../../../src/api/parking";
import { Button } from "../../../src/components/button";
import { ParkingMap } from "../../../src/components/seeker/parking-map";
import { ErrorState, Header, PriceText, RatingText, Screen, SkeletonBlock } from "../../../src/components/seeker/ui";
import { colors } from "../../../src/constants/theme";
import { useApiClient } from "../../../src/services/api";
import { useExpireSession } from "../../../src/services/query";

export default function ListingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Array.isArray(id) ? id[0] : id;
  const api = useApiClient();
  const queryClient = useQueryClient();
  const listing = useQuery({
    queryKey: ["listing", listingId],
    enabled: Boolean(listingId),
    queryFn: () => fetchListing(api, listingId ?? ""),
  });
  useExpireSession(listing.error);
  const save = useMutation({
    mutationFn: () => toggleFavorite(api, listingId ?? ""),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["listing", listingId] });
      void queryClient.invalidateQueries({ queryKey: ["favorites"] });
    },
  });
  const space = listing.data;

  return (
    <Screen>
      <Header title={space?.title ?? "Parking"} onBack={() => router.back()} />
      {listing.isPending ? <View style={styles.pad}><SkeletonBlock /></View> : null}
      {listing.isError ? <View style={styles.pad}><ErrorState message="This listing could not be loaded." onRetry={() => void listing.refetch()} /></View> : null}
      {space ? (
        <ScrollView contentContainerStyle={styles.content}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
            {space.images.length === 0 ? (
              <View style={styles.photoFallback}><Text style={styles.fallback}>No photo</Text></View>
            ) : (
              space.images.map((image) => <Image key={image.url} source={{ uri: image.url }} style={styles.photo} accessibilityLabel={image.alt || space.title} />)
            )}
          </ScrollView>
          <Text style={styles.location}>{space.displayLocation}</Text>
          {space.address ? <Text style={styles.body}>{space.address}</Text> : null}
          <View style={styles.row}>
            <PriceText paise={space.pricePerHour} />
            <RatingText average={space.ratingAvg} count={space.ratingCount} />
          </View>
          {space.description ? <Text style={styles.body}>{space.description}</Text> : null}
          <Text style={styles.meta}>{[space.spaceType, space.propertyType, space.level, space.covered ? "Covered" : "Open to the sky"].filter(Boolean).join(" · ")}</Text>
          {space.vehicleTypes.length > 0 ? <Text style={styles.meta}>Vehicles: {space.vehicleTypes.join(", ")}</Text> : null}
          {space.lengthFt || space.widthFt || space.heightFt ? (
            <Text style={styles.meta}>
              Size: {[space.lengthFt ? `${space.lengthFt} ft long` : "", space.widthFt ? `${space.widthFt} ft wide` : "", space.heightFt ? `${space.heightFt} ft high` : ""].filter(Boolean).join(", ")}
            </Text>
          ) : null}
          {space.vehicleSizeNotes ? <Text style={styles.body}>{space.vehicleSizeNotes}</Text> : null}
          {space.amenities.length > 0 ? <Text style={styles.meta}>{space.amenities.join(" · ")}</Text> : null}
          {space.accessInstructions ? <Text style={styles.body}>{space.accessInstructions}</Text> : null}
          {space.rules.map((rule) => (
            <Text key={rule} style={styles.body}>{rule}</Text>
          ))}
          <Text style={styles.host}>{space.hostName}</Text>
          {space.latitude != null && space.longitude != null ? (
            <View style={styles.map}>
              <ParkingMap
                markers={[{ id: space.id, latitude: space.latitude, longitude: space.longitude, title: space.title }]}
                center={{ lat: space.latitude, lng: space.longitude }}
                onSelect={() => undefined}
              />
            </View>
          ) : null}
          {space.reviews.map((review) => (
            <View key={review.id} style={styles.review}>
              <Text style={styles.meta}>{review.author} · {review.rating.toFixed(1)}</Text>
              {review.comment ? <Text style={styles.body}>{review.comment}</Text> : null}
            </View>
          ))}
          <Button label={space.isFavorite ? "Saved" : "Save"} variant="secondary" loading={save.isPending} onPress={() => save.mutate()} />
          <Button label="Continue to booking" onPress={() => router.push({ pathname: "/(app)/book/[id]", params: { id: space.id } } as unknown as Href)} />
        </ScrollView>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: 20 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 12 },
  gallery: { gap: 8 },
  photo: { width: 280, height: 180, borderRadius: 16, backgroundColor: "#EEF2F6" },
  photoFallback: { width: 280, height: 180, borderRadius: 16, backgroundColor: "#EEF2F6", alignItems: "center", justifyContent: "center" },
  fallback: { color: colors.muted, fontWeight: "700" },
  location: { color: colors.muted, fontSize: 15 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  body: { color: colors.midnight, fontSize: 15, lineHeight: 22 },
  meta: { color: colors.midnight, fontSize: 14, fontWeight: "600" },
  host: { color: colors.midnight, fontSize: 16, fontWeight: "800" },
  map: { height: 220, borderRadius: 16, overflow: "hidden" },
  review: { gap: 4, paddingTop: 8 },
});
