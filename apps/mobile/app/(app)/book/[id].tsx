import { router, useLocalSearchParams } from "expo-router";
import { Button } from "../../../src/components/button";
import { EmptyState, Header, Screen } from "../../../src/components/seeker/ui";

export default function BookingEntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listingId = Array.isArray(id) ? id[0] : id;
  return (
    <Screen scroll>
      <Header title="Booking" onBack={() => router.back()} />
      <EmptyState
        title="Booking is next"
        body="This listing is ready to book. Creating a booking and taking payment are not part of this version."
      />
      {listingId ? <Button label="Back to listing" variant="secondary" onPress={() => router.back()} /> : null}
    </Screen>
  );
}
