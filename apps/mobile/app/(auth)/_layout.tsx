import { Redirect, Stack } from "expo-router";
import { Splash } from "../../src/components/splash";
import { useAuth } from "../../src/services/auth-context";

export default function AuthLayout() {
  const { state } = useAuth();
  if (state.status === "loading") return <Splash />;
  if (state.status === "signed-in") return <Redirect href="/(app)" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
