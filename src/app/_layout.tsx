import * as Notifications from 'expo-notifications';
import { DarkTheme, DefaultTheme, ThemeProvider, router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { PickyProvider } from '@/hooks/use-picky';

SplashScreen.preventAutoHideAsync();

if (Platform.OS !== 'web') {
  // show Picky's notification even when the app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export default function TabLayout() {
  const colorScheme = useColorScheme();

  // tapping "3 need your call" opens the review screen
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => router.navigate('/review'));
    return () => sub.remove();
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <PickyProvider>
        <AnimatedSplashOverlay />
        <AppTabs />
      </PickyProvider>
    </ThemeProvider>
  );
}
