import { EmptyState, Header, Screen } from "../../../src/components/seeker/ui";

export default function BookingsScreen() {
  return (
    <Screen scroll>
      <Header title="Bookings" />
      <EmptyState title="Bookings come next" body="Your Place2Park bookings will appear here. Booking and payment are not part of this version." />
    </Screen>
  );
}
