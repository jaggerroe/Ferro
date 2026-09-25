import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';

export default function FriendsScreen() {
  return (
    <Screen title="Friends">
      <PlaceholderCard
        eyebrow="Coming with accounts"
        title="Train with your crew"
        body="Add friends, see their workouts and PRs, and compete on leaderboards."
      />
    </Screen>
  );
}
