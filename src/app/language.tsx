import { router, useFocusEffect } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/app-toast';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { supportedAppLanguages, useTranslation } from '@/lib/i18n';
import { animateLayoutIfEnabled } from '@/lib/motion';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { appThemeFor } from '@/lib/theme';
import type { AppLanguage, ReadingSettings } from '@/types/reader';

export default function LanguageSettingsScreen() {
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

  const updateLanguage = async (appLanguage: AppLanguage) => {
    if (settings.appLanguage === appLanguage) return;
    const next = { ...settings, appLanguage };
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
        <Text style={[styles.title, { color: colors.text }]}>{t('language')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {settingsReady ? (
          <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {supportedAppLanguages.map((language, index) => {
              const selected = settings.appLanguage === language.code;
              return (
                <View key={language.code}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${t('language')}${t(language.labelKey)}`}
                    accessibilityState={{ selected }}
                    onPress={() => {
                      void updateLanguage(language.code);
                    }}
                    style={({ pressed }) => [
                      styles.languageOption,
                      selected && { backgroundColor: colors.backgroundElement },
                      pressed && styles.pressed,
                    ]}>
                    <Text style={[styles.languageOptionText, { color: colors.text }]}>{t(language.labelKey)}</Text>
                    {selected ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : null}
                  </Pressable>
                  {index < supportedAppLanguages.length - 1 ? <View style={[styles.separator, { backgroundColor: colors.border }]} /> : null}
                </View>
              );
            })}
          </View>
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
  },
  panel: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    overflow: 'hidden',
  },
  languageOption: {
    minHeight: TouchTarget + 8,
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
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three,
    backgroundColor: Colors.light.border,
  },
  pressed: {
    opacity: 0.72,
  },
});
