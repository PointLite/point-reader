import React from 'react';
import { Platform, StyleSheet, Switch, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { AppColors } from '@/lib/theme';

type SettingRowProps = {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  colors?: AppColors;
};

export function SettingRow({ title, description, value, onValueChange, colors = Colors.light }: SettingRowProps) {
  return (
    <View style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        {description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={title}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.backgroundElement, true: colors.accent }}
        thumbColor={colors.surface}
        ios_backgroundColor={colors.backgroundElement}
        style={styles.switch}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 76,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  copy: {
    flex: 1,
    gap: Spacing.one,
  },
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '700',
    color: Colors.light.text,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.light.textSecondary,
  },
  switch: {
    transform: Platform.OS === 'android' ? [{ scaleX: 1.16 }, { scaleY: 1.16 }] : undefined,
  },
});
