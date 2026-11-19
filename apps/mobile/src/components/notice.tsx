import { StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export function Notice({ message, tone = "danger" }: { message: string | null; tone?: "danger" | "success" }) {
  if (!message) return null;
  return (
    <View style={[styles.box, tone === "success" && styles.success]}>
      <Text style={[styles.text, tone === "success" && styles.successText]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: colors.dangerBg,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  text: { color: colors.danger, fontSize: 14 },
  success: { backgroundColor: "#F3F8E8" },
  successText: { color: colors.midnight },
});
