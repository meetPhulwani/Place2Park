import { Pressable, StyleSheet, Text, type PressableProps, ActivityIndicator } from "react-native";
import { colors } from "../constants/theme";

export function Button({
  label,
  loading,
  disabled,
  variant = "primary",
  ...rest
}: PressableProps & { label: string; loading?: boolean; variant?: "primary" | "secondary" | "ghost" }) {
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        pressed && !inactive && styles.pressed,
        inactive && styles.inactive,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.white : colors.blue} />
      ) : (
        <Text style={[styles.label, variant === "primary" ? styles.primaryLabel : styles.secondaryLabel]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primary: { backgroundColor: colors.blue },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.88 },
  inactive: { opacity: 0.55 },
  label: { fontSize: 16, fontWeight: "700" },
  primaryLabel: { color: colors.white },
  secondaryLabel: { color: colors.midnight },
});
