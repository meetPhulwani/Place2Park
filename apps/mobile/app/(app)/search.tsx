import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { suggestPlaces } from "../../src/api/parking";
import { Field } from "../../src/components/field";
import { Button } from "../../src/components/button";
import { Header, Screen } from "../../src/components/seeker/ui";
import { colors } from "../../src/constants/theme";
import { createSearchDebounce, sessionSearches } from "../../src/lib/search";
import { useApiClient } from "../../src/services/api";

export default function SearchScreen() {
  const api = useApiClient();
  const [text, setText] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recent, setRecent] = useState(sessionSearches.list());

  useEffect(() => {
    const debounce = createSearchDebounce(
      300,
      (fn, ms) => setTimeout(fn, ms),
      (id) => clearTimeout(id as ReturnType<typeof setTimeout>)
    );
    debounce.run(() => setDebounced(text.trim()));
    return () => debounce.cancel();
  }, [text]);

  const suggestions = useQuery({
    queryKey: ["suggest", debounced],
    enabled: debounced.length >= 2,
    queryFn: ({ signal }) => suggestPlaces(api, debounced, signal),
  });

  function openQuery(label: string, lat?: number, lng?: number) {
    const trimmed = label.trim();
    if (trimmed.length < 2) return;
    sessionSearches.add(trimmed);
    setRecent(sessionSearches.list());
    router.push({
      pathname: "/(app)/results",
      params: {
        q: trimmed,
        label: trimmed,
        ...(lat != null && lng != null ? { lat: String(lat), lng: String(lng) } : {}),
      },
    } as unknown as Href);
  }

  return (
    <Screen scroll>
      <Header title="Find parking" subtitle="Cities, localities, and areas from Place2Park listings." onBack={() => router.back()} />
      <Field label="Where" value={text} onChangeText={setText} autoCapitalize="words" autoCorrect={false} placeholder="Bandra, Andheri, a city" />
      <View style={styles.actions}>
        <Button label="Search" onPress={() => openQuery(text)} />
        <Button
          label="Clear"
          variant="secondary"
          onPress={() => {
            setText("");
            setDebounced("");
          }}
        />
      </View>
      {suggestions.isFetching ? <Text style={styles.note}>Looking up places</Text> : null}
      {suggestions.data?.map((place) => (
        <Pressable key={place.id} accessibilityRole="button" onPress={() => openQuery(place.mainText, place.lat, place.lng)} style={styles.row}>
          <Text style={styles.main}>{place.mainText}</Text>
          {place.secondaryText ? <Text style={styles.secondary}>{place.secondaryText}</Text> : null}
        </Pressable>
      ))}
      {debounced.length >= 2 && suggestions.isSuccess && suggestions.data.length === 0 ? (
        <Text style={styles.note}>No matching areas in current listings. You can still search this name.</Text>
      ) : null}
      {recent.length > 0 ? <Text style={styles.heading}>Recent searches</Text> : null}
      {recent.map((item) => (
        <Pressable key={item} accessibilityRole="button" onPress={() => openQuery(item)} style={styles.row}>
          <Text style={styles.main}>{item}</Text>
        </Pressable>
      ))}
      {recent.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            sessionSearches.clear();
            setRecent([]);
          }}
          style={styles.clearRecent}
        >
          <Text style={styles.clearLabel}>Clear recent searches</Text>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: 10 },
  note: { color: colors.muted, fontSize: 14 },
  heading: { color: colors.midnight, fontSize: 16, fontWeight: "800", marginTop: 8 },
  row: { minHeight: 48, justifyContent: "center" },
  main: { color: colors.midnight, fontSize: 16, fontWeight: "700" },
  secondary: { color: colors.muted, fontSize: 13 },
  clearRecent: { minHeight: 44, justifyContent: "center" },
  clearLabel: { color: colors.blue, fontWeight: "700" },
});
