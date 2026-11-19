import { StyleSheet, Text } from "react-native";
import { Button } from "../../../src/components/button";
import { Screen } from "../../../src/components/seeker/ui";
import { colors } from "../../../src/constants/theme";
import { useAuth } from "../../../src/services/auth-context";

const ROLE_LABELS: Record<string, string> = {
  DRIVER: "Seeker",
  HOST: "Keeper",
  BOTH: "All-rounder",
  ADMIN: "Administrator",
};

export default function ProfileScreen() {
  const { state, logout } = useAuth();
  if (state.status !== "signed-in") return null;
  return (
    <Screen scroll>
      <Text style={styles.name}>{state.user.name}</Text>
      <Text style={styles.meta}>{state.user.email}</Text>
      <Text style={styles.meta}>{ROLE_LABELS[state.user.role] ?? state.user.role}</Text>
      <Button label="Log out" variant="secondary" onPress={() => void logout()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  name: { color: colors.midnight, fontSize: 28, fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 16 },
});
