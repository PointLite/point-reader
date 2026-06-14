import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/app-toast';
import { SegmentedControl } from '@/components/segmented-control';
import { SettingRow } from '@/components/setting-row';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTranslation } from '@/lib/i18n';
import { animateLayoutIfEnabled } from '@/lib/motion';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { appThemeFor } from '@/lib/theme';
import type { ReadingSettings } from '@/types/reader';

const MODE_SEGMENT_WIDTH = 150;

export default function PageTurnSettingsScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const { colors } = appThemeFor(settings.colorScheme, systemScheme);

  useFocusEffect(
    () => {
      let isActive = true;
      setSettingsReady(false);
      loadReadingSettings()
        .then((storedSettings) => {
          if (!isActive) return;
          setSettings(storedSettings);
          setSettingsReady(true);
        })
        .catch((error) => {
          if (!isActive) return;
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
        <Text style={[styles.title, { color: colors.text }]}>{t('pageTurn')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settingsReady ? (
          <>
            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.modeRow}>
                <Text style={[styles.panelTitle, { color: colors.text }]}>{t('pageTurnMode')}</Text>
                <SegmentedControl
                  colors={colors}
                  width={MODE_SEGMENT_WIDTH}
                  options={[
                    { value: 'scroll', label: t('scroll'), accessibilityLabel: t('scrollTurn') },
                    { value: 'tap', label: t('tap'), accessibilityLabel: t('tapTurn') },
                  ]}
                  value={settings.mode}
                  einkOptimization={settings.einkOptimization}
                  onChange={(mode) => update({ mode })}
                />
              </View>
            </View>

            {settings.mode === 'scroll' ? (
              <SettingRow
                colors={colors}
                title={t('hideScrollbar')}
                description={t('hideScrollbarDesc')}
                value={settings.hideScrollbar}
                onValueChange={(value) => update({ hideScrollbar: value })}
              />
            ) : (
              <>
                <SettingRow
                  colors={colors}
                  title={t('swapTapZones')}
                  description={t('swapTapZonesDesc')}
                  value={settings.swapTapZones}
                  onValueChange={(value) => update({ swapTapZones: value })}
                />
                <SettingRow
                  colors={colors}
                  title={t('volumeTurnPage')}
                  description={t('volumeTurnPageDesc')}
                  value={settings.volumeTurnPage}
                  onValueChange={(value) => update({ volumeTurnPage: value })}
                />
                <SettingRow
                  colors={colors}
                  title={t('showPageButtons')}
                  value={settings.showPageButtons}
                  onValueChange={(value) => update({ showPageButtons: value })}
                />
              </>
            )}
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
  modeRow: {
    minHeight: TouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
});
