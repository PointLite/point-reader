import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Download, RefreshCw } from 'lucide-react-native';
import React, { useState } from 'react';

import { InkButton } from '@/components/ink-button';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useToast } from '@/components/app-toast';
import { useTranslation } from '@/lib/i18n';
import { useAppTheme, type AppColors } from '@/lib/theme';

const appIcon = require('../../assets/images/icon.png');

function resourceBundleVersion() {
  return Updates.updateId?.split('-')[0] ?? null;
}

export default function AboutScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const { colors } = useAppTheme();
  const [checking, setChecking] = useState(false);
  const appVersion = Constants.expoConfig?.version ?? '0.1.0';
  const bundleVersion = resourceBundleVersion() ?? t('resourceBundleEmbedded');

  const checkForUpdates = async () => {
    if (checking) return;
    if (!Updates.isEnabled) {
      showToast(t('updatesUnavailable'));
      return;
    }

    setChecking(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        showToast(t('noUpdatesAvailable'));
        return;
      }

      const fetchResult = await Updates.fetchUpdateAsync();
      if (!fetchResult.isNew && !fetchResult.isRollBackToEmbedded) {
        showToast(t('noUpdatesAvailable'));
        return;
      }

      Alert.alert(t('updateReady'), t('updateReadyDesc'), [
        { text: t('later'), style: 'cancel' },
        {
          text: t('restartNow'),
          onPress: () => {
            void Updates.reloadAsync();
          },
        },
      ]);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('checkUpdatesFailed'));
    } finally {
      setChecking(false);
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
        <Text style={[styles.title, { color: colors.text }]}>{t('about')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.heroPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Image source={appIcon} style={styles.appIcon} contentFit="cover" />
          <View style={styles.heroCopy}>
            <Text style={[styles.appName, { color: colors.text }]}>{Constants.expoConfig?.name ?? 'Point Reader'}</Text>
            <Text style={[styles.appDescription, { color: colors.textSecondary }]}>{t('appFeatureDescription')}</Text>
          </View>
        </View>

        <View style={[styles.infoPanel, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <InfoRow label={t('appVersion')} value={appVersion} colors={colors} />
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <InfoRow label={t('resourceBundleVersion')} value={bundleVersion} colors={colors} />
        </View>

        <InkButton
          colors={colors}
          label={checking ? t('checkingUpdates') : t('checkUpdates')}
          icon={checking ? RefreshCw : Download}
          variant="primary"
          disabled={checking}
          onPress={checkForUpdates}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: AppColors;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.text }]} numberOfLines={1}>
        {value}
      </Text>
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
  heroPanel: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  appIcon: {
    width: 92,
    height: 92,
    borderRadius: 24,
  },
  heroCopy: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  appName: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: Colors.light.text,
    textAlign: 'center',
  },
  appDescription: {
    maxWidth: 330,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.light.textSecondary,
    textAlign: 'center',
  },
  infoPanel: {
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.three,
  },
  infoRow: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  infoLabel: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: Colors.light.textSecondary,
  },
  infoValue: {
    maxWidth: '58%',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    color: Colors.light.text,
    textAlign: 'right',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.light.border,
  },
});
