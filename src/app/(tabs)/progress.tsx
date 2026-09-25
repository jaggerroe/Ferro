import { PlaceholderCard } from '@/components/placeholder-card';
import { Screen } from '@/components/screen';

export default function ProgressScreen() {
  return (
    <Screen title="Progress">
      <PlaceholderCard
        title="Charts and PRs"
        body="See your lifts climb over time and every personal record you set."
      />
    </Screen>
  );
}
