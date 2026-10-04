import { type FolderItem } from '@/features/library/shelf-model';
import { styles } from '@/features/library/shelf-styles';
import type { BookGroup } from '@/features/library/types';
import { type WebDavImportSnapshot } from '@/features/webdav/import-queue';
import { useTranslation } from '@/shared/i18n/index';
import { type AppColors } from '@/shared/theme/theme';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import {
  Check,
  ChevronLeft,
  CircleEllipsis,
  Folder,
  Plus,
  Search,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

export function ShelfListHeader({
  colors,
  activeGroup,
  webDavImport,
  onBack,
  onRename,
}: {
  colors: AppColors;
  activeGroup: BookGroup | null;
  webDavImport: WebDavImportSnapshot;
  onBack: () => void;
  onRename: () => void;
}) {
  const { t } = useTranslation();
  if (!activeGroup && webDavImport.status === 'idle') return null;

  return (
    <View style={styles.listHeaderStack}>
      {webDavImport.status === 'idle' ? null : (
        <WebDavImportProgressRow colors={colors} state={webDavImport} />
      )}
      {activeGroup ? (
        <View style={[styles.groupHeader, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('backToShelf')}
            onPress={onBack}
            style={({ pressed }) => [styles.groupBackButton, pressed && styles.sortMenuItemPressed]}>
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.4} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('renameFolder')}
            onPress={onRename}
            style={({ pressed }) => [styles.groupHeaderCopy, pressed && styles.sortMenuItemPressed]}>
            <Text style={[styles.groupHeaderTitle, { color: colors.text }]} numberOfLines={1}>
              {activeGroup.name}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function WebDavImportProgressRow({ colors, state }: { colors: AppColors; state: WebDavImportSnapshot }) {
  const { t } = useTranslation();
  const progress = state.total > 0 ? Math.min(1, state.completed / state.total) : 0;
  const progressLabel = state.total > 0 ? `${state.completed}/${state.total}` : t('preparing');
  const title =
    state.status === 'running'
      ? t('webdavImporting')
      : state.status === 'success'
        ? t('webdavImportSuccess')
        : t('webdavImportFailed');
  const detail = state.message ?? progressLabel;

  return (
    <View style={[styles.webDavImportRow, { borderColor: colors.border, backgroundColor: colors.surface }]}>
      <View style={styles.webDavImportCopy}>
        <Text style={[styles.webDavImportTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.webDavImportMeta, { color: colors.textSecondary }]} numberOfLines={1}>
          {state.status === 'running' ? progressLabel : detail}
        </Text>
      </View>
      {state.status === 'running' ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={[styles.webDavImportResult, { color: colors.textSecondary }]}>
          {t('importedBooks', { count: state.imported })}
        </Text>
      )}
      <View style={[styles.webDavImportTrack, { backgroundColor: colors.backgroundElement }]}>
        <View
          style={[styles.webDavImportFill, { backgroundColor: colors.accent, width: `${progress * 100}%` }]}
        />
      </View>
    </View>
  );
}

export function FolderCard({
  folder,
  width,
  colors,
  selected,
  onPress,
  onLongPress,
}: {
  folder: FolderItem;
  width: number;
  colors: AppColors;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { t } = useTranslation();
  const previews = folder.books.slice(0, 9);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, ${t('booksCount', { count: folder.books.length })}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [styles.folderCard, { width }, pressed && styles.sortMenuItemPressed]}>
      <View
        style={[
          styles.folderCover,
          {
            height: width * 1.44,
            borderColor: selected ? colors.accent : colors.border,
            backgroundColor: selected ? colors.accentSoft : colors.surface,
          },
          selected && styles.folderCoverSelected,
        ]}>
        <View
          style={[
            styles.folderTab,
            { borderColor: colors.border, backgroundColor: colors.backgroundElement },
          ]}
        />
        <View style={styles.folderPreviewGrid}>
          {previews.map((book) => (
            <View
              key={book.id}
              style={[
                styles.folderPreview,
                { borderColor: colors.border, backgroundColor: colors.background },
              ]}>
              {book.coverUri ? (
                <Image source={{ uri: book.coverUri }} style={styles.folderPreviewImage} contentFit="cover" />
              ) : (
                <Folder size={14} color={colors.textSecondary} strokeWidth={2} />
              )}
            </View>
          ))}
        </View>
        {selected ? (
          <View style={[styles.folderSelectedBadge, { backgroundColor: colors.accent }]}>
            <Check size={18} color={colors.surface} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.folderTitle, { color: colors.text }]} numberOfLines={2}>
          {folder.name}
        </Text>
        <Text style={[styles.folderCount, { color: colors.textSecondary }]}>
          {t('booksCount', { count: folder.books.length })}
        </Text>
      </View>
    </Pressable>
  );
}

export function ImportAction({
  colors,
  icon: Icon,
  title,
  description,
  onPress,
}: {
  colors: AppColors;
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importAction,
        { borderColor: colors.border, backgroundColor: colors.background },
        pressed && styles.sortMenuItemPressed,
      ]}>
      <View
        style={[styles.importActionIcon, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Icon size={24} color={colors.text} strokeWidth={2.2} />
      </View>
      <View style={styles.importActionCopy}>
        <Text style={[styles.importActionTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.importActionDescription, { color: colors.textSecondary }]}>{description}</Text>
      </View>
    </Pressable>
  );
}

export function ShelfHeader({
  colors,
  query,
  bookCount,
  moreButtonRef,
  t,
  onChangeQuery,
  onToggleSortMenu,
}: {
  colors: AppColors;
  query: string;
  bookCount: number;
  moreButtonRef: React.RefObject<View | null>;
  t: ReturnType<typeof useTranslation>['t'];
  onChangeQuery: (text: string) => void;
  onToggleSortMenu: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.topControls}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Search size={20} color={colors.textSecondary} strokeWidth={2.2} />
          <TextInput
            accessibilityLabel={t('searchBooks')}
            placeholder={t('searchBooksPlaceholder', { count: bookCount })}
            placeholderTextColor={colors.textSecondary}
            value={query}
            onChangeText={onChangeQuery}
            style={[styles.searchInput, { color: colors.text }]}
          />
        </View>
        <View ref={moreButtonRef} style={styles.moreMenuAnchor}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('sort')}
            onPress={onToggleSortMenu}
            style={[
              styles.headerIconButton,
              { borderColor: colors.border, backgroundColor: colors.surface },
            ]}>
            <CircleEllipsis size={24} color={colors.text} strokeWidth={2.2} />
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('settings')}
          onPress={() => router.push('/settings')}
          style={[styles.headerIconButton, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Settings size={24} color={colors.text} strokeWidth={2.2} />
        </Pressable>
      </View>
    </View>
  );
}

export function ImportTile({
  width,
  importing,
  colors,
  onPress,
}: {
  width: number;
  importing: boolean;
  colors: AppColors;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('importBooks')}
      disabled={importing}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importTile,
        { borderColor: colors.border, backgroundColor: colors.surfaceMuted },
        {
          width,
          height: width * 1.44,
          opacity: importing ? 0.45 : pressed ? 0.65 : 1,
        },
      ]}>
      <Plus size={42} color={colors.text} strokeWidth={1.8} />
    </Pressable>
  );
}
