import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';

export default function RoutinesScreen() {
  return (
    <Screen title="Routines">
      <PlaceholderCard
        title="Saved workouts"
        body="Save routines like Push, Pull and Legs so you can start them in one tap."
      />
    </Screen>
  );
}
