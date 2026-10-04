import { router } from 'expo-router';
import { Check, ChevronLeft } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSettingsEditor } from './use-settings-editor';

import type { AppLanguage } from '@/features/settings/types';
import { supportedAppLanguages } from '@/shared/i18n/index';
import { Colors, Radius, Spacing, TouchTarget } from '@/shared/theme/tokens';

export default function LanguageSettingsScreen() {
  const { settings, settingsReady, update, t, colors } = useSettingsEditor();
  const updateLanguage = (appLanguage: AppLanguage) => {
    if (settings.appLanguage !== appLanguage) void update({ appLanguage });
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
                    <Text style={[styles.languageOptionText, { color: colors.text }]}>
                      {t(language.labelKey)}
                    </Text>
                    {selected ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : null}
                  </Pressable>
                  {index < supportedAppLanguages.length - 1 ? (
                    <View style={[styles.separator, { backgroundColor: colors.border }]} />
                  ) : null}
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
