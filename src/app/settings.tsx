import { router, useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/app-toast';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingRow } from '@/components/setting-row';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { supportedAppLanguages, useTranslation } from '@/lib/i18n';
import { animateLayoutIfEnabled } from '@/lib/motion';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { appThemeFor } from '@/lib/theme';
import type { ReadingSettings } from '@/types/reader';

const SCHEME_SEGMENT_WIDTH = 220;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const { colors } = appThemeFor(settings.colorScheme, systemScheme);
  const currentLanguage = supportedAppLanguages.find((language) => language.code === settings.appLanguage) ?? supportedAppLanguages[0];
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';

  useFocusEffect(
    () => {
      let isActive = true;
      setSettingsReady(false);
      loadReadingSettings()
        .then((storedSettings) => {
          if (!isActive) {
            return;
          }
          setSettings(storedSettings);
          setSettingsReady(true);
        })
        .catch((error) => {
          if (!isActive) {
            return;
          }
          setSettingsReady(true);
          showToast(error instanceof Error ? error.message : t('operationFailed'));
        });
      return () => {
        isActive = false;
      };
    }
  );

  const update = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settings, ...patch };
    animateLayoutIfEnabled(settings.einkOptimization);
    setSettings(next);
    try {
      await saveReadingSettings(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('back')}
          onPress={() => router.back()}
          style={[styles.iconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>{t('settings')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settingsReady ? (
          <>
            <SettingRow
              colors={colors}
              title={t('alwaysShowStatusBar')}
              description={t('alwaysShowStatusBarDesc')}
              value={settings.alwaysShowStatusBar}
              onValueChange={(value) => update({ alwaysShowStatusBar: value })}
            />
            <SettingRow
              colors={colors}
              title={t('keepAwake')}
              description={t('keepAwakeDesc')}
              value={settings.keepAwake}
              onValueChange={(value) => update({ keepAwake: value })}
            />
            <SettingRow
              colors={colors}
              title={t('einkOptimization')}
              description={t('einkOptimizationDesc')}
              value={settings.einkOptimization}
              onValueChange={(value) => update({ einkOptimization: value })}
            />

            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.modeRow}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>{t('theme')}</Text>
                <SegmentedControl
                  colors={colors}
                  width={SCHEME_SEGMENT_WIDTH}
                  options={[
                    { value: 'light', label: t('themeLight'), accessibilityLabel: `${t('theme')}${t('themeLight')}` },
                    { value: 'dark', label: t('themeDark'), accessibilityLabel: `${t('theme')}${t('themeDark')}` },
                    { value: 'system', label: t('themeSystem'), accessibilityLabel: `${t('theme')}${t('themeSystem')}` },
                  ]}
                  value={settings.colorScheme}
                  einkOptimization={settings.einkOptimization}
                  onChange={(colorScheme) => update({ colorScheme })}
                />
              </View>
            </View>

            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('language')}
                onPress={() => router.push('/language' as never)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>{t('language')}</Text>
                <View style={styles.optionValueGroup}>
                  <Text style={[styles.optionValue, { color: colors.textSecondary }]}>{t(currentLanguage.labelKey)}</Text>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
            </View>

            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('pageTurn')}
                onPress={() => router.push('/page-turn' as never)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>{t('pageTurn')}</Text>
                <View style={styles.optionValueGroup}>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
            </View>

            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('about')}
                onPress={() => router.push('/about' as never)}
                style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>{t('about')}</Text>
                <View style={styles.optionValueGroup}>
                  <Text style={[styles.optionValue, { color: colors.textSecondary }]}>{t('appVersionValue', { version: appVersion })}</Text>
                  <ChevronRight size={20} color={colors.textSecondary} />
                </View>
              </Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    minHeight: 60,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: Colors.light.text,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  panel: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  panelTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
  optionRow: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  optionValueGroup: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  optionValue: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  pressed: {
    opacity: 0.72,
  },
  modeRow: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
