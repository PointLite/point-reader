import { router, useFocusEffect } from 'expo-router';
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ToastViewport, useToast } from '@/components/app-toast';
import { SettingRow } from '@/components/setting-row';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { supportedAppLanguages, useTranslation } from '@/lib/i18n';
import { INTERACTION_ANIMATION_MS, animateLayoutIfEnabled } from '@/lib/motion';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { appThemeFor, type AppColors } from '@/lib/theme';
import type { ReadingSettings } from '@/types/reader';

const MODE_SEGMENT_WIDTH = 150;
const SCHEME_SEGMENT_WIDTH = 220;

function canUseLiquidGlass() {
  return Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
}

export default function SettingsScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const nativeColorScheme = useColorScheme();
  const systemScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [settingsReady, setSettingsReady] = useState(false);
  const [languageModalOpen, setLanguageModalOpen] = useState(false);
  const { colors } = appThemeFor(settings.colorScheme, systemScheme);
  const currentLanguage = supportedAppLanguages.find((language) => language.code === settings.appLanguage) ?? supportedAppLanguages[0];

  useFocusEffect(
    useCallback(() => {
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

function SegmentedControl<T extends string>({
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
  const [animatedIndex] = useState(() => new Animated.Value(selectedIndex));
  const optionGap = Spacing.one;
  const capsulePadding = Spacing.one;
  const thumbWidth = (width - capsulePadding * 2 - optionGap * (options.length - 1)) / options.length;
  const liquidGlassAvailable = canUseLiquidGlass();
  const translateX = animatedIndex.interpolate({
    inputRange: options.map((_, index) => index),
    outputRange: options.map((_, index) => index * (thumbWidth + optionGap)),
  });

  useEffect(() => {
    if (einkOptimization) {
      animatedIndex.setValue(selectedIndex);
      return;
    }
    Animated.timing(animatedIndex, {
      toValue: selectedIndex,
      duration: INTERACTION_ANIMATION_MS,
      useNativeDriver: true,
    }).start();
  }, [animatedIndex, einkOptimization, selectedIndex]);

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
            transform: [{ translateX }],
          },
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
    ...StyleSheet.absoluteFillObject,
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
  modeOptionTextSelected: {
    color: Colors.light.surface,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: Spacing.three,
    backgroundColor: 'rgba(20,25,35,0.26)',
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
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
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
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '700',
    color: Colors.light.text,
  },
});
