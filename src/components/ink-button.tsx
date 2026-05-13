import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';

type InkButtonProps = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  selected?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function InkButton({
  label,
  onPress,
  icon: Icon,
  variant = 'secondary',
  selected,
  disabled,
  style,
}: InkButtonProps) {
  const colors = Colors.light;
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const backgroundColor = selected || isPrimary ? colors.text : variant === 'quiet' ? 'transparent' : colors.surface;
  const color = selected || isPrimary ? colors.surface : isDanger ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor,
          borderColor: isDanger ? colors.danger : colors.border,
          opacity: disabled ? 0.45 : pressed ? 0.72 : 1,
        },
        style,
      ]}>
      {Icon ? <Icon size={18} color={color} strokeWidth={2} /> : null}
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: TouchTarget,
    borderWidth: 1,
    borderRadius: Radius.medium,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.two,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
  },
});
