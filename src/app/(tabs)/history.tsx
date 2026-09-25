import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';

export default function HistoryScreen() {
  return (
    <Screen title="History">
      <PlaceholderCard
        title="No workouts yet"
        body="Every workout you finish will show up here, newest first."
      />
    </Screen>
  );
}
