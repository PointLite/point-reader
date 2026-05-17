import { ReaderProvider } from '@epubjs-react-native/core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useAppTheme } from '@/lib/theme';

export default function RootLayout() {
  const { colors, statusBarStyle } = useAppTheme();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReaderProvider>
        <StatusBar style={statusBarStyle} />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="reader/[bookId]" options={{ gestureEnabled: false }} />
        </Stack>
      </ReaderProvider>
    </GestureHandlerRootView>
  );
}
