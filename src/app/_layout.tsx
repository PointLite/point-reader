import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ToastProvider, ToastViewport } from '@/components/app-toast';
import { useEinkOptimization } from '@/lib/motion';
import { useAppTheme } from '@/lib/theme';

export default function RootLayout() {
  const { colors, statusBarStyle } = useAppTheme();
  const einkOptimization = useEinkOptimization();
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
