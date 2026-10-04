import { entryMetaText, estimateEntryNameWidth, type BrowseState } from '@/features/webdav/browser-model';
import { closeToHome } from '@/features/webdav/browser-screen';
import { styles } from '@/features/webdav/browser-styles';
import { useWebDavImport } from '@/features/webdav/import-queue';
import type { WebDavDirectory, WebDavEntry } from '@/features/webdav/types';
import { useTranslation } from '@/shared/i18n/index';
import { type AppColors } from '@/shared/theme/theme';
import { Spacing } from '@/shared/theme/tokens';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Folder,
  Pencil,
  Plus,
  Server,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, View, type TextStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export function WebDavMainList({
  colors,
  browseState,
  loading,
  importing,
  importState,
  selectedCount,
  selectedHrefSet,
  sortedEntries,
  directories,
  sortButtonRef,
  onOpenSort,
  onToggleEntry,
  onOpenEntry,
  onOpenDirectory,
  onEditDirectory,
  onDeleteDirectory,
}: {
  colors: AppColors;
  browseState: BrowseState | null;
  loading: boolean;
  importing: boolean;
  importState: ReturnType<typeof useWebDavImport>;
  selectedCount: number;
  selectedHrefSet: Set<string>;
  sortedEntries: WebDavEntry[];
  directories: WebDavDirectory[];
  sortButtonRef: React.RefObject<View | null>;
  onOpenSort: () => void;
  onToggleEntry: (href: string) => void;
  onOpenEntry: (entry: WebDavEntry) => void;
  onOpenDirectory: (directory: WebDavDirectory) => void;
  onEditDirectory: (directory: WebDavDirectory) => void;
  onDeleteDirectory: (directory: WebDavDirectory) => void;
}) {
  const { t } = useTranslation();

  if (browseState) {
    return (
      <View style={styles.listSection}>
        <View style={styles.fixedSectionHeader}>
          <View style={styles.browserTitleRow}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('directoryContents')}</Text>
            <View ref={sortButtonRef}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('sort')}
                disabled={loading}
                onPress={onOpenSort}
                style={({ pressed }) => [
                  styles.sortHeaderButton,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  loading && styles.disabledControl,
                  pressed && styles.pressed,
                ]}>
                <SlidersHorizontal size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>
          <Text style={[styles.browserMeta, { color: colors.textSecondary }]}>
            {t('selectedItems', { count: selectedCount })}
            {importing
              ? t('importingProgress', { completed: importState.completed, total: importState.total })
              : ''}
          </Text>
        </View>
        <FlatList
          data={sortedEntries}
          keyExtractor={(item) => item.href}
          style={styles.scrollList}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <EmptyState
              colors={colors}
              loading={loading}
              text={loading ? t('readingDirectory') : t('emptyDirectory')}
            />
          }
          renderItem={({ item }) => (
            <WebDavEntryRow
              entry={item}
              colors={colors}
              selected={selectedHrefSet.has(item.href)}
              disabled={importing || loading}
              onToggle={() => onToggleEntry(item.href)}
              onPress={() => onOpenEntry(item)}
            />
          )}
        />
      </View>
    );
  }

  return (
    <View style={styles.listSection}>
      <View style={styles.fixedSectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{t('myDirectories')}</Text>
      </View>
      <FlatList
        data={directories}
        keyExtractor={(item) => item.id}
        style={styles.scrollList}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={<EmptyState colors={colors} loading={false} text={t('emptyDirectories')} />}
        renderItem={({ item }) => (
          <DirectoryCard
            directory={item}
            colors={colors}
            disabled={loading || importing}
            onPress={() => onOpenDirectory(item)}
            onEdit={() => onEditDirectory(item)}
            onDelete={() => onDeleteDirectory(item)}
          />
        )}
      />
    </View>
  );
}

export function WebDavTopBar({
  colors,
  browseState,
  loading,
  importing,
  selectedCount,
  onBack,
  onAddDirectory,
  onImportSelection,
}: {
  colors: AppColors;
  browseState: BrowseState | null;
  loading: boolean;
  importing: boolean;
  selectedCount: number;
  onBack: () => void;
  onAddDirectory: () => void;
  onImportSelection: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View style={styles.topBar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('back')}
        accessibilityState={{ disabled: loading }}
        disabled={loading}
        onPress={onBack}
        style={[
          styles.iconButton,
          { borderColor: colors.border, backgroundColor: colors.surface },
          loading && styles.disabledControl,
        ]}>
        <ChevronLeft size={24} color={colors.text} />
      </Pressable>
      <View style={styles.titleCopy}>
        <Text style={[styles.title, { color: colors.text }]}>
          {browseState ? browseState.directory.name : 'WebDAV'}
        </Text>
        {browseState ? (
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
            {browseState.label}
          </Text>
        ) : null}
      </View>
      {browseState ? (
        <View style={styles.browseActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('closeWebdavBrowse')}
            disabled={loading}
            onPress={closeToHome}
            style={({ pressed }) => [
              styles.iconButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
              loading && styles.disabledControl,
              pressed && styles.pressed,
            ]}>
            <X size={22} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('importSelected')}
            disabled={selectedCount === 0 || importing || loading}
            onPress={onImportSelection}
            style={({ pressed }) => [
              styles.actionButton,
              { backgroundColor: colors.accent },
              (selectedCount === 0 || loading) && styles.actionButtonDisabled,
              pressed && styles.pressed,
            ]}>
            {importing ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Download size={20} color={colors.surface} />
            )}
            <Text style={[styles.actionButtonText, { color: colors.surface }]}>{t('import')}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('addDirectory')}
          disabled={loading || importing}
          onPress={onAddDirectory}
          style={({ pressed }) => [
            styles.iconButton,
            { borderColor: colors.border, backgroundColor: colors.surface },
            (loading || importing) && styles.disabledControl,
            pressed && styles.pressed,
          ]}>
          <Plus size={24} color={colors.text} />
        </Pressable>
      )}
    </View>
  );
}

function DirectoryCard({
  directory,
  colors,
  disabled,
  onPress,
  onEdit,
  onDelete,
}: {
  directory: WebDavDirectory;
  colors: AppColors;
  disabled: boolean;
  onPress: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={[styles.directoryCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('browseDirectory', { name: directory.name })}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [
          styles.directoryMain,
          disabled && styles.disabledControl,
          pressed && styles.pressed,
        ]}>
        <View
          style={[
            styles.directoryIcon,
            { borderColor: colors.border, backgroundColor: colors.backgroundElement },
          ]}>
          <Server size={24} color={colors.text} />
        </View>
        <View style={styles.directoryCopy}>
          <Text style={[styles.directoryName, { color: colors.text }]} numberOfLines={1}>
            {directory.name}
          </Text>
          <Text style={[styles.directoryUrl, { color: colors.textSecondary }]} numberOfLines={2}>
            {directory.url}
          </Text>
          <Text style={[styles.directoryMeta, { color: colors.accent }]}>
            {directory.username ? t('account', { username: directory.username }) : t('noAccount')}
          </Text>
        </View>
      </Pressable>
      <View style={[styles.directoryActions, { borderLeftColor: colors.border }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('editDirectoryName', { name: directory.name })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.cardIconButton,
            { backgroundColor: colors.surface },
            disabled && styles.disabledControl,
            pressed && styles.pressed,
          ]}>
          <Pencil size={20} color={colors.text} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('deleteDirectoryName', { name: directory.name })}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onDelete}
          style={({ pressed }) => [
            styles.cardIconButton,
            styles.dangerIconButton,
            { backgroundColor: colors.surface, borderTopColor: colors.border },
            disabled && styles.disabledControl,
            pressed && styles.pressed,
          ]}>
          <Trash2 size={20} color={colors.danger} />
        </Pressable>
      </View>
    </View>
  );
}

export function DirectoryLoadingOverlay({ colors }: { colors: AppColors }) {
  const { t } = useTranslation();
  return (
    <View style={styles.loadingOverlay} pointerEvents="auto">
      <View style={[styles.loadingCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('readingDirectory')}</Text>
      </View>
    </View>
  );
}

function WebDavEntryRow({
  entry,
  colors,
  selected,
  disabled,
  onToggle,
  onPress,
}: {
  entry: WebDavEntry;
  colors: AppColors;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onPress: () => void;
}) {
  const { t, language } = useTranslation();
  const meta = entryMetaText(entry, t, language);

  return (
    <View style={[styles.entry, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: selected, disabled }}
        accessibilityLabel={t('selectEntry', { name: entry.name })}
        disabled={disabled}
        onPress={onToggle}
        hitSlop={Spacing.one}
        style={styles.checkboxTouch}>
        <View
          style={[
            styles.checkboxBox,
            { borderColor: colors.accent, backgroundColor: colors.surface },
            selected && { backgroundColor: colors.accent },
          ]}>
          {selected ? <Check size={14} color={colors.surface} strokeWidth={3} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          entry.type === 'directory' ? t('enterDirectory', { name: entry.name }) : entry.name
        }
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.entryMain, pressed && styles.pressed]}>
        {entry.type === 'directory' ? (
          <Folder size={24} color={colors.text} />
        ) : (
          <FileText size={24} color={colors.textSecondary} />
        )}
        <View style={styles.entryCopy}>
          <AutoScrollText text={entry.name} textStyle={[styles.entryName, { color: colors.text }]} />
          {meta ? <Text style={[styles.entryMeta, { color: colors.textSecondary }]}>{meta}</Text> : null}
        </View>
        {entry.type === 'directory' ? <ChevronRight size={20} color={colors.textSecondary} /> : null}
      </Pressable>
    </View>
  );
}

function EmptyState({ loading, text, colors }: { loading: boolean; text: string; colors: AppColors }) {
  return (
    <View style={styles.empty}>
      {loading ? <ActivityIndicator color={colors.text} /> : null}
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

function AutoScrollText({ text, textStyle }: { text: string; textStyle: TextStyle | TextStyle[] }) {
  const translateX = useSharedValue(0);
  const [containerWidth, setContainerWidth] = useState(0);
  const estimatedWidth = estimateEntryNameWidth(text);
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const contentWidth = Math.max(measuredWidth, estimatedWidth);
  const overflow = Math.max(0, contentWidth - containerWidth);
  const animatedTextStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.get() }],
  }));

  useEffect(() => {
    cancelAnimation(translateX);
    translateX.set(0);
    if (overflow <= 2) return;

    translateX.set(
      withRepeat(
        withSequence(
          withDelay(900, withTiming(-overflow, { duration: Math.max(2600, overflow * 45) })),
          withDelay(900, withTiming(0, { duration: 1 }))
        ),
        -1
      )
    );
    return () => {
      cancelAnimation(translateX);
    };
  }, [overflow, translateX]);

  return (
    <View
      style={styles.autoTextViewport}
      onLayout={(event) => setContainerWidth(event.nativeEvent.layout.width)}>
      <Text
        numberOfLines={1}
        onTextLayout={(event) => {
          const lineWidth = event.nativeEvent.lines[0]?.width ?? 0;
          setMeasuredWidth(Math.ceil(lineWidth));
        }}
        style={[textStyle, styles.autoTextMeasure]}>
        {text}
      </Text>
      <Animated.Text
        numberOfLines={1}
        ellipsizeMode="clip"
        style={[
          textStyle,
          styles.autoTextContent,
          contentWidth > 0 && { width: contentWidth },
          animatedTextStyle,
        ]}>
        {text}
      </Animated.Text>
    </View>
  );
}
