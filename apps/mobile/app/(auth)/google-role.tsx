import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Redirect, router } from "expo-router";
import { ApiRequestError } from "../../src/api/client";
import { AuthScreen } from "../../src/components/auth-screen";
import { Button } from "../../src/components/button";
import { Notice } from "../../src/components/notice";
import { TextLink } from "../../src/components/legal-links";
import { colors } from "../../src/constants/theme";
import { createSubmitLock } from "../../src/lib/submit-lock";
import { useAuth } from "../../src/services/auth-context";
import type { SignupInput } from "../../src/types/auth";

const submitLock = createSubmitLock();
const ROLES: { id: SignupInput["role"]; label: string }[] = [
  { id: "DRIVER", label: "Seeker" },
  { id: "HOST", label: "Keeper" },
  { id: "BOTH", label: "Both" },
];

export default function GoogleRoleScreen() {
  const { state, completeGoogle, cancelChallenge } = useAuth();
  const [role, setRole] = useState<SignupInput["role"]>("DRIVER");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (state.status === "signed-in") return <Redirect href="/(app)" />;
  if (state.status !== "google-role") return <Redirect href="/(auth)/login" />;

  async function onSubmit() {
    setError(null);
    await submitLock(async () => {
      setLoading(true);
      try {
        await completeGoogle(role);
        router.replace("/(app)");
      } catch (err) {
        setError(err instanceof ApiRequestError ? err.message : "Google sign-in could not be finished.");
      } finally {
        setLoading(false);
      }
    });
  }

  return (
    <AuthScreen title="Choose your account" copy={`Finish Google sign-in for ${state.registration.maskedEmail}.`}>
      <Notice message={error} />
      <View style={styles.roles}>
        {ROLES.map((item) => {
          const selected = item.id === role;
          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setRole(item.id)}
              style={[styles.role, selected && styles.roleSelected]}
            >
              <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Button label="Continue" loading={loading} onPress={() => void onSubmit()} />
      <TextLink
        label="Cancel"
        onPress={() => {
          cancelChallenge();
          router.replace("/(auth)/login");
        }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  roles: { flexDirection: "row", gap: 8 },
  role: {
    flex: 1,
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  roleSelected: { borderColor: colors.blue, backgroundColor: colors.blue },
  roleLabel: { color: colors.midnight, fontWeight: "700" },
  roleLabelSelected: { color: colors.white },
});
