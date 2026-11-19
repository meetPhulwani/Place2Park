import { Platform, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { colors } from "../../constants/theme";
import type { SearchCenter } from "../../types/listing";

export function mapsKeyConfigured() {
  return (process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "").length > 0;
}

export function ParkingMap({
  markers,
  center,
  onSelect,
}: {
  markers: { id: string; latitude: number; longitude: number; title: string }[];
  center: SearchCenter | null;
  onSelect: (id: string) => void;
}) {
  if (Platform.OS === "android" && !mapsKeyConfigured()) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>Map needs a Google Maps key</Text>
        <Text style={styles.body}>Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for Android maps. The list still uses the same listings.</Text>
      </View>
    );
  }
  if (markers.length === 0 || !center) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.title}>No map locations</Text>
        <Text style={styles.body}>These listings do not include a usable coordinate.</Text>
      </View>
    );
  }
  return (
    <MapView
      style={styles.map}
      provider={mapsKeyConfigured() ? PROVIDER_GOOGLE : undefined}
      initialRegion={{
        latitude: center.lat,
        longitude: center.lng,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      }}
    >
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          coordinate={{ latitude: marker.latitude, longitude: marker.longitude }}
          title={marker.title}
          onPress={() => onSelect(marker.id)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, minHeight: 360 },
  fallback: { minHeight: 220, padding: 20, justifyContent: "center", gap: 8, backgroundColor: "#F7F8FA" },
  title: { color: colors.midnight, fontSize: 18, fontWeight: "800" },
  body: { color: colors.muted, fontSize: 14, lineHeight: 20 },
});
