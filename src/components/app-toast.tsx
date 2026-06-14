import React, { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { AppColors } from '@/lib/theme';

const ToastMessageContext = createContext<string | null>(null);
const ToastActionContext = createContext<((message: string) => void) | null>(null);
const TOAST_DURATION_MS = 1800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const showToast = useCallback((nextMessage: string) => {
    if (!nextMessage.trim()) return;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    setMessage(nextMessage);
    timerRef.current = setTimeout(() => {
      setMessage(null);
      timerRef.current = null;
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastActionContext.Provider value={showToast}>
      <ToastMessageContext.Provider value={message}>{children}</ToastMessageContext.Provider>
    </ToastActionContext.Provider>
  );
}

export function useToast() {
  const showToast = use(ToastActionContext);
  if (!showToast) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return showToast;
}

export function ToastViewport({ colors }: { colors: AppColors }) {
  const message = use(ToastMessageContext);
  const { height } = useWindowDimensions();

  if (!message) return null;

  return (
    <View pointerEvents="none" style={[styles.layer, { paddingBottom: height * 0.15 }]}>
      <View style={[styles.toast, { backgroundColor: colors.accent }]}>
        <Text style={[styles.toastText, { color: colors.surface }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: Spacing.three,
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    alignSelf: 'center',
    minHeight: 42,
    maxWidth: '100%',
    borderRadius: 10,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.light.accent,
  },
  toastText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    textAlign: 'center',
    color: Colors.light.surface,
  },
});
