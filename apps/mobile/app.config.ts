import type { ConfigContext, ExpoConfig } from "expo/config";

const LOCATION_PLUGIN = [
  "expo-location",
  {
    locationWhenInUsePermission: "Place2Park uses your location while the app is open to find nearby parking.",
  },
] as const;

export default ({ config }: ConfigContext): ExpoConfig => {
  const mapsKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  return {
    ...config,
    name: config.name ?? "Place2Park",
    slug: config.slug ?? "place2park",
    plugins: [...(config.plugins ?? []), [...LOCATION_PLUGIN]],
    ios: {
      ...config.ios,
      config: mapsKey ? { ...config.ios?.config, googleMapsApiKey: mapsKey } : config.ios?.config,
    },
    android: {
      ...config.android,
      config: mapsKey
        ? { ...config.android?.config, googleMaps: { apiKey: mapsKey } }
        : config.android?.config,
    },
  };
};
