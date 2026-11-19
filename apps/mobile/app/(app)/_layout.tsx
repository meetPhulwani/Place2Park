import { Redirect, Stack } from "expo-router";
import { Splash } from "../../src/components/splash";
import { useAuth } from "../../src/services/auth-context";

export default function AppLayout() {
  const { state } = useAuth();
  if (state.status === "loading") return <Splash />;
  if (state.status === "verify-email") return <Redirect href="/(auth)/verify-email" />;
  if (state.status === "google-role") return <Redirect href="/(auth)/google-role" />;
  if (state.status !== "signed-in") return <Redirect href="/(auth)/login" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
