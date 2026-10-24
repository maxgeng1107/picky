import { NativeTabs } from 'expo-router/native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';
import { usePicky } from '@/hooks/use-picky';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const { state } = usePicky();
  const asks = state.review ? state.review.total - state.review.index : 0;

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="photo.on.rectangle.angled" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="review">
        <NativeTabs.Trigger.Label>Your call</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="rectangle.split.2x1" />
        <NativeTabs.Trigger.Badge hidden={asks === 0}>{String(asks)}</NativeTabs.Trigger.Badge>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="taste">
        <NativeTabs.Trigger.Label>Your taste</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="sparkles" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
