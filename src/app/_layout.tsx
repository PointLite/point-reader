import { ReaderProvider } from '@epubjs-react-native/core';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReaderProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'none',
            contentStyle: { backgroundColor: '#F7F5EF' },
          }}>
          <Stack.Screen name="reader/[bookId]" options={{ gestureEnabled: false }} />
        </Stack>
      </ReaderProvider>
    </GestureHandlerRootView>
  );
}
