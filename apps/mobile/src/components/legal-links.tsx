import { Pressable, StyleSheet, Text } from "react-native";
import * as Linking from "expo-linking";
import { colors } from "../constants/theme";

const TERMS = "https://www.place2park.me/terms-and-conditions";
const PRIVACY = "https://www.place2park.me/privacy-policy";

export function LegalLinks() {
  return (
    <Text style={styles.copy}>
      By continuing you agree to the{" "}
      <Text style={styles.link} onPress={() => void Linking.openURL(TERMS)}>
        Terms
      </Text>{" "}
      and{" "}
      <Text style={styles.link} onPress={() => void Linking.openURL(PRIVACY)}>
        Privacy Policy
      </Text>
      .
    </Text>
  );
}

export function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={styles.hit}>
      <Text style={styles.link}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  copy: { color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: "center" },
  link: { color: colors.blue, fontWeight: "700" },
  hit: { minHeight: 44, alignItems: "center", justifyContent: "center" },
});
