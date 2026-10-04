import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { readerFontAssets } from '@/features/reader/font-assets';
import { useEinkOptimization } from '@/shared/theme/motion';
import { useAppTheme } from '@/shared/theme/theme';
import { ToastProvider, ToastViewport } from '@/shared/ui/app-toast';

export default function RootLayout() {
  const { colors, statusBarStyle } = useAppTheme();
  const einkOptimization = useEinkOptimization();
  const [fontsLoaded, fontLoadError] = useFonts(readerFontAssets);

  if (!fontsLoaded && !fontLoadError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ToastProvider>
        <StatusBar style={statusBarStyle} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: einkOptimization ? 'none' : 'default',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="reader/[bookId]" options={{ gestureEnabled: false }} />
        </Stack>
        <ToastViewport colors={colors} />
      </ToastProvider>
    </GestureHandlerRootView>
  );
}
