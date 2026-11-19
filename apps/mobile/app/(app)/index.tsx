import { Redirect, type Href } from "expo-router";

export default function AppIndex() {
  return <Redirect href={"/(app)/(tabs)" as Href} />;
}
