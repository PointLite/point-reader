import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ToastViewport, useToast } from '@/components/app-toast';
import { SettingRow } from '@/components/setting-row';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { supportedAppLanguages, useTranslation } from '@/lib/i18n';
import { animateLayoutIfEnabled } from '@/lib/motion';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { appThemeFor } from '@/lib/theme';
import type { ReadingSettings } from '@/types/reader';

export default function SettingsScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const { colors } = appThemeFor(settings.colorScheme, systemScheme);
  const currentLanguage = supportedAppLanguages.find((language) => language.code === settings.appLanguage) ?? supportedAppLanguages[0];

  useFocusEffect(
    useCallback(() => {
      loadReadingSettings()
        .then(setSettings)
        .catch((error) => {
          showToast(error instanceof Error ? error.message : t('operationFailed'));
        });
    }, [showToast, t])
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('language')}
            onPress={() => setLanguageModalOpen(true)}
            style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>{t('language')}</Text>
            <View style={styles.optionValueGroup}>
              <Text style={[styles.optionValue, { color: colors.textSecondary }]}>{t(currentLanguage.labelKey)}</Text>
              <ChevronRight size={20} color={colors.textSecondary} />
            </View>
          </Pressable>
        </View>

        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.modeRow}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>{t('theme')}</Text>
            <View style={[styles.schemeCapsule, { backgroundColor: colors.backgroundElement }]}>
              {(['light', 'dark', 'system'] as ReadingSettings['colorScheme'][]).map((colorScheme) => {
                const selected = settings.colorScheme === colorScheme;
                const label = colorScheme === 'light' ? t('themeLight') : colorScheme === 'dark' ? t('themeDark') : t('themeSystem');
                return (
                  <Pressable
                    key={colorScheme}
                    accessibilityRole="button"
                    accessibilityLabel={`${t('theme')}${label}`}
                    accessibilityState={{ selected }}
                    onPress={() => update({ colorScheme })}
                    style={[styles.schemeOption, selected && { backgroundColor: colors.text }]}>
                    <Text style={[styles.modeOptionText, { color: colors.text }, selected && { color: colors.surface }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.modeRow}>
            <Text style={[styles.panelTitle, { color: colors.text }]}>{t('pageTurnMode')}</Text>
            <View style={[styles.modeCapsule, { backgroundColor: colors.backgroundElement }]}>
              {(['scroll', 'tap'] as ReadingSettings['mode'][]).map((mode) => {
                const selected = settings.mode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'scroll' ? t('scrollTurn') : t('tapTurn')}
                    accessibilityState={{ selected }}
                    onPress={() => update({ mode })}
                    style={[styles.modeOption, selected && { backgroundColor: colors.text }]}>
                    <Text style={[styles.modeOptionText, { color: colors.text }, selected && { color: colors.surface }]}>
                      {mode === 'scroll' ? t('scroll') : t('tap')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
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
      </ScrollView>

      <Modal visible={languageModalOpen} transparent animationType={settings.einkOptimization ? 'none' : 'fade'} onRequestClose={() => setLanguageModalOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('close')}
            onPress={() => setLanguageModalOpen(false)}
            style={StyleSheet.absoluteFillObject}
          />
          <View style={[styles.languageCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.languageTitle, { color: colors.text }]}>{t('language')}</Text>
            {supportedAppLanguages.map((language) => {
              const selected = settings.appLanguage === language.code;
              return (
                <Pressable
                  key={language.code}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('language')}${t(language.labelKey)}`}
                  accessibilityState={{ selected }}
                  onPress={() => {
                    void update({ appLanguage: language.code });
                    setLanguageModalOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.languageOption,
                    { borderColor: colors.border },
                    selected && { backgroundColor: colors.backgroundElement },
                    pressed && styles.pressed,
                  ]}>
                  <Text style={[styles.languageOptionText, { color: colors.text }]}>{t(language.labelKey)}</Text>
                  {selected ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : null}
                </Pressable>
              );
            })}
          </View>
          <ToastViewport colors={colors} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.light.background,
  },
  topBar: {
    minHeight: 64,
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
    fontSize: 28,
    fontWeight: '900',
    color: Colors.light.text,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
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
    fontWeight: '900',
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
    fontWeight: '700',
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
  modeCapsule: {
    flexDirection: 'row',
    width: 150,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundElement,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  schemeCapsule: {
    flexDirection: 'row',
    width: 220,
    minHeight: 40,
    borderRadius: 20,
    backgroundColor: Colors.light.backgroundElement,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  modeOption: {
    flex: 1,
    minHeight: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  schemeOption: {
    flex: 1,
    minHeight: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeOptionSelected: {
    backgroundColor: Colors.light.text,
  },
  modeOptionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.light.text,
  },
  modeOptionTextSelected: {
    color: Colors.light.surface,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(23,23,23,0.28)',
  },
  languageCard: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  languageTitle: {
    fontSize: 20,
    lineHeight: 24,
    fontWeight: '900',
    color: Colors.light.text,
    marginBottom: Spacing.one,
  },
  languageOption: {
    minHeight: TouchTarget,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  languageOptionText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '800',
    color: Colors.light.text,
  },
});
