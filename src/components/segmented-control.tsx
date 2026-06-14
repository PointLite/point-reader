import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, withTiming } from 'react-native-reanimated';

import { Colors, Spacing } from '@/constants/theme';
import { INTERACTION_ANIMATION_MS } from '@/lib/motion';
import type { AppColors } from '@/lib/theme';

function canUseLiquidGlass() {
  return Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

export function SegmentedControl<T extends string>({
  colors,
  width,
  options,
  value,
  einkOptimization,
  onChange,
}: {
  colors: AppColors;
  width: number;
  options: { value: T; label: string; accessibilityLabel: string }[];
  value: T;
  einkOptimization: boolean;
  onChange: (value: T) => void;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const optionGap = Spacing.one;
  const capsulePadding = Spacing.one;
  const thumbWidth = (width - capsulePadding * 2 - optionGap * (options.length - 1)) / options.length;
  const liquidGlassAvailable = canUseLiquidGlass();
  const animatedIndex = useDerivedValue(() =>
    einkOptimization ? selectedIndex : withTiming(selectedIndex, { duration: INTERACTION_ANIMATION_MS })
  );
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: animatedIndex.get() * (thumbWidth + optionGap) }],
  }));

  return (
    <View style={[styles.segmentedCapsule, { width, backgroundColor: liquidGlassAvailable ? 'transparent' : colors.backgroundElement }]}>
      {liquidGlassAvailable ? (
        <GlassView
          pointerEvents="none"
          glassEffectStyle="regular"
          tintColor={colors.backgroundElement}
          colorScheme="auto"
          style={styles.segmentedGlassBackground}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.segmentedThumb,
          {
            width: thumbWidth,
            backgroundColor: colors.accent,
          },
          thumbStyle,
        ]}
      />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.segmentedOption}>
            <Text style={[styles.modeOptionText, { color: colors.text }, selected && { color: colors.surface }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segmentedCapsule: {
    position: 'relative',
    flexDirection: 'row',
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundElement,
    padding: Spacing.one,
    gap: Spacing.one,
    overflow: 'hidden',
  },
  segmentedGlassBackground: {
    ...StyleSheet.absoluteFill,
  },
  segmentedThumb: {
    position: 'absolute',
    left: Spacing.one,
    top: Spacing.one,
    bottom: Spacing.one,
    borderRadius: 16,
  },
  segmentedOption: {
    flex: 1,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  modeOptionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
});
