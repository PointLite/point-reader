import Slider from '@react-native-community/slider';
import { router, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SettingRow } from '@/components/setting-row';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import type { ReadingSettings } from '@/types/reader';

export default function SettingsScreen() {
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);

  useFocusEffect(
    useCallback(() => {
      loadReadingSettings().then(setSettings);
    }, [])
  );

  const update = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    await saveReadingSettings(next);
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={() => router.back()}
          style={styles.iconButton}>
          <ChevronLeft size={24} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.title}>设置</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <SettingRow
          title="始终显示状态栏"
          description="阅读时保留系统状态信息，适合电纸书设备观察电量。"
          value={settings.alwaysShowStatusBar}
          onValueChange={(value) => update({ alwaysShowStatusBar: value })}
        />
        <SettingRow
          title="保持屏幕常亮"
          description="进入阅读页时阻止自动锁屏。"
          value={settings.keepAwake}
          onValueChange={(value) => update({ keepAwake: value })}
        />

        <View style={styles.panel}>
          <View style={styles.modeRow}>
            <Text style={styles.panelTitle}>翻页方式</Text>
            <View style={styles.modeCapsule}>
              {(['scroll', 'tap'] as ReadingSettings['mode'][]).map((mode) => {
                const selected = settings.mode === mode;
                return (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityLabel={mode === 'scroll' ? '滚动翻页' : '点击翻页'}
                    accessibilityState={{ selected }}
                    onPress={() => update({ mode })}
                    style={[styles.modeOption, selected && styles.modeOptionSelected]}>
                    <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>
                      {mode === 'scroll' ? '滚动' : '点击'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        {settings.mode === 'scroll' ? (
          <SettingRow
            title="隐藏滚动条"
            description="减少电子墨水屏刷新干扰。"
            value={settings.hideScrollbar}
            onValueChange={(value) => update({ hideScrollbar: value })}
          />
        ) : (
          <>
            <SettingRow
              title="交换点击区域"
              description="左右手持握时可交换前后翻页区域。"
              value={settings.swapTapZones}
              onValueChange={(value) => update({ swapTapZones: value })}
            />
            <SettingRow
              title="音量键翻页"
              description="设置项已保存；需要 Dev Client 原生扩展后可接入硬件按键。"
              value={settings.volumeTurnPage}
              onValueChange={(value) => update({ volumeTurnPage: value })}
            />
            <SettingRow
              title="显示翻页按钮"
              value={settings.showPageButtons}
              onValueChange={(value) => update({ showPageButtons: value })}
            />
          </>
        )}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>默认字号</Text>
          <Slider
            minimumValue={16}
            maximumValue={30}
            step={1}
            value={settings.fontSize}
            minimumTrackTintColor={Colors.light.text}
            maximumTrackTintColor={Colors.light.border}
            thumbTintColor={Colors.light.text}
            onSlidingComplete={(value) => update({ fontSize: value })}
          />
          <Text style={styles.value}>{settings.fontSize} pt</Text>
        </View>
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
  modeOption: {
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
    color: Colors.light.textSecondary,
  },
  modeOptionTextSelected: {
    color: Colors.light.surface,
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.light.textSecondary,
    textAlign: 'right',
  },
});
