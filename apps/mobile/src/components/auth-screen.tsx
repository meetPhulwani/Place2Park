import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../constants/theme";

export function AuthScreen({
  title,
  copy,
  children,
}: {
  title: string;
  copy: string;
  children: ReactNode;
}) {
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>Place2Park</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.copy}>{copy}</Text>
        <View style={styles.form}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 72, paddingBottom: 32, gap: 8 },
  brand: { color: colors.blue, fontSize: 18, fontWeight: "800" },
  title: { color: colors.midnight, fontSize: 32, fontWeight: "800", marginTop: 12 },
  copy: { color: colors.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  form: { marginTop: 28, gap: 16 },
});
