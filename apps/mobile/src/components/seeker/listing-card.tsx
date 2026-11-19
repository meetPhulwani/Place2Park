import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../constants/theme";
import { amenityLabels, vehicleLabels } from "../../lib/listings";
import type { SpaceSummary } from "../../types/listing";
import { PriceText, RatingText } from "./ui";

export function ListingCard({
  space,
  selected,
  saved,
  onPress,
  onToggleSaved,
}: {
  space: SpaceSummary;
  selected?: boolean;
  saved?: boolean;
  onPress: () => void;
  onToggleSaved?: () => void;
}) {
  const vehicles = vehicleLabels(space.vehicleTypes);
  const amenities = amenityLabels(space);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.card, selected && styles.selected]}>
      {space.imageUrl ? (
        <Image source={{ uri: space.imageUrl }} style={styles.photo} accessibilityIgnoresInvertColors />
      ) : (
        <View style={styles.photoFallback}>
          <Text style={styles.fallback}>No photo</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.title}>{space.title}</Text>
        <Text style={styles.location}>{space.displayLocation || "Location unavailable"}</Text>
        <View style={styles.row}>
          <PriceText paise={space.pricePerHour} />
          <RatingText average={space.ratingAvg} count={space.ratingCount} />
        </View>
        <Text style={styles.meta}>
          {[vehicles.join(" · "), space.distanceKm != null ? `${space.distanceKm.toFixed(1)} km` : "", space.available === true ? "Available" : space.available === false ? "Busy for that time" : ""]
            .filter(Boolean)
            .join("  ")}
        </Text>
        {amenities.length > 0 ? <Text style={styles.meta}>{amenities.join(" · ")}</Text> : null}
        {onToggleSaved ? (
          <Pressable accessibilityRole="button" onPress={onToggleSaved} style={styles.save}>
            <Text style={styles.saveLabel}>{saved ? "Saved" : "Save"}</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, overflow: "hidden", backgroundColor: colors.white },
  selected: { borderColor: colors.blue },
  photo: { height: 140, width: "100%", backgroundColor: "#EEF2F6" },
  photoFallback: { height: 140, alignItems: "center", justifyContent: "center", backgroundColor: "#EEF2F6" },
  fallback: { color: colors.muted, fontWeight: "700" },
  body: { padding: 14, gap: 4 },
  title: { color: colors.midnight, fontSize: 17, fontWeight: "800" },
  location: { color: colors.muted, fontSize: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  meta: { color: colors.midnight, fontSize: 13 },
  save: { minHeight: 44, justifyContent: "center" },
  saveLabel: { color: colors.blue, fontWeight: "700" },
});
