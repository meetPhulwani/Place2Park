import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export function Splash() {
  return (
    <View style={styles.screen}>
      <Text style={styles.word}>Place2Park</Text>
      <ActivityIndicator color={colors.lime} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.midnight,
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
  },
  word: { color: colors.white, fontSize: 32, fontWeight: "800", letterSpacing: -0.5 },
});
