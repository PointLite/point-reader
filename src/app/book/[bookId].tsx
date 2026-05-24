import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { File as ExpoFile } from 'expo-file-system';
import * as FileSystem from 'expo-file-system/legacy';
import { BookOpen, ChevronDown, ChevronLeft, ChevronUp, Pencil, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useToast } from '@/components/app-toast';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { deleteBooks, getBook } from '@/lib/books';
import { extractEpubDetailMetadata, type EpubDetailMetadata } from '@/lib/epubMetadata';
import { useTranslation } from '@/lib/i18n';
import { useAppTheme, type AppColors } from '@/lib/theme';
import type { Book } from '@/types/reader';

export default function BookDetailScreen() {
  const { t, language } = useTranslation();
  const showToast = useToast();
  const { colors } = useAppTheme();
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const [book, setBook] = useState<Book | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [fileCreatedAt, setFileCreatedAt] = useState<number | null>(null);
  const [fileUpdatedAt, setFileUpdatedAt] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<EpubDetailMetadata | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    metadata: true,
    series: true,
    description: true,
  });

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      async function load() {
        try {
          if (!bookId) return;
          const nextBook = await getBook(bookId);
          if (!mounted) return;
          setBook(nextBook);
          if (!nextBook) {
            setFileSize(null);
            setFileCreatedAt(null);
            setFileUpdatedAt(null);
            setMetadata(null);
            return;
          }
          const info = await FileSystem.getInfoAsync(nextBook.fileUri);
          let createdAt: number | null = null;
          try {
            createdAt = new ExpoFile(nextBook.fileUri).creationTime;
          } catch {
            createdAt = null;
          }
          if (mounted) {
            setFileSize(info.exists ? info.size ?? null : null);
            setFileUpdatedAt(info.exists ? info.modificationTime * 1000 : null);
            setFileCreatedAt(createdAt);
          }
          if (nextBook.format === 'epub') {
            const nextMetadata = await extractEpubDetailMetadata(nextBook.fileUri);
            if (mounted) setMetadata(nextMetadata);
          } else if (mounted) {
            setMetadata(null);
          }
        } catch (error) {
          if (mounted) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        }
      }
      load();
      return () => {
        mounted = false;
      };
    }, [bookId, showToast, t])
  );

  const removeBook = useCallback(() => {
    if (!book) return;
    Alert.alert(t('deleteBooks'), t('deleteBookMessage', { title: book.title }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteBooks([book.id]);
            router.replace('/');
          } catch (error) {
            showToast(error instanceof Error ? error.message : t('operationFailed'));
          }
        },
      },
    ]);
  }, [book, showToast, t]);

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
        <Text style={[styles.title, { color: colors.text }]}>{t('bookDetails')}</Text>
      </View>

      {book ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={[styles.cover, { borderColor: colors.border, backgroundColor: colors.surfaceMuted }]}>
              {book.coverUri ? (
                <Image source={{ uri: book.coverUri }} style={styles.coverImage} resizeMode="cover" />
              ) : (
                <View style={styles.fallbackCover}>
                  <BookOpen size={34} color={colors.text} />
                  <Text style={[styles.format, { color: colors.text }]}>{book.format.toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View style={styles.summary}>
              <Text style={[styles.bookTitle, { color: colors.text }]}>{metadata?.title || book.title}</Text>
              <Text style={[styles.author, { color: colors.textSecondary }]}>{metadata?.author || book.author || t('authorUnknown')}</Text>
              <View style={styles.actionRow}>
                <ActionIcon accessibilityLabel={t('editBookPlaceholder')} icon={<Pencil size={22} color={colors.text} strokeWidth={2.6} />} />
                <ActionIcon
                  accessibilityLabel={t('deleteBooks')}
                  onPress={removeBook}
                  icon={<Trash2 size={23} color={colors.danger} strokeWidth={2.4} />}
                />
              </View>
            </View>
          </View>

          <SectionHeader
            title={t('metadata')}
            colors={colors}
            expanded={expandedSections.metadata}
            onPress={() => setExpandedSections((current) => ({ ...current, metadata: !current.metadata }))}
          />
          {expandedSections.metadata ? (
            <>
              <View style={styles.metaGrid}>
                <MetadataItem colors={colors} label={t('publisher')} value={metadata?.publisher || t('unknown')} />
                <MetadataItem colors={colors} label={t('publishedDate')} value={formatEpubDate(metadata?.publishedAt, t('unknown'), language)} align="right" />
                <MetadataItem colors={colors} label={t('updatedDate')} value={formatTimestamp(fileUpdatedAt, t('unknown'), language)} />
                <MetadataItem colors={colors} label={t('addedDate')} value={formatTimestamp(fileCreatedAt, t('unknown'), language)} align="right" />
                <MetadataItem colors={colors} label={t('bookLanguage')} value={metadata?.language || t('unknown')} />
                <MetadataItem colors={colors} label={t('subject')} value={metadata?.subject || t('unknown')} align="right" />
                <MetadataItem colors={colors} label={t('format')} value={book.format.toUpperCase()} />
                <MetadataItem colors={colors} label={t('fileSize')} value={formatFileSize(fileSize, t('unknown'))} align="right" />
              </View>
              <MetadataItem colors={colors} label={t('identifier')} value={metadata?.identifier || t('unknown')} full />
            </>
          ) : null}

          <SectionHeader
            title={t('series')}
            colors={colors}
            expanded={expandedSections.series}
            onPress={() => setExpandedSections((current) => ({ ...current, series: !current.series }))}
          />
          {expandedSections.series ? (
            <View style={styles.metaGrid}>
              <MetadataItem colors={colors} label={t('series')} value={metadata?.series || t('unknown')} />
              <MetadataItem colors={colors} label={t('seriesIndex')} value={metadata?.seriesIndex || t('unknown')} align="right" />
            </View>
          ) : null}

          <SectionHeader
            title={t('description')}
            colors={colors}
            expanded={expandedSections.description}
            onPress={() => setExpandedSections((current) => ({ ...current, description: !current.description }))}
          />
          {expandedSections.description ? <Text style={[styles.description, { color: colors.textSecondary }]}>{metadata?.description || t('unknown')}</Text> : null}
        </ScrollView>
      ) : (
        <View style={styles.content}>
          <Text style={[styles.author, { color: colors.textSecondary }]}>{t('bookNotFound')}</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function ActionIcon({ icon, accessibilityLabel, onPress }: { icon: React.ReactNode; accessibilityLabel: string; onPress?: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.placeholderIcon, pressed && styles.pressedIcon]}>
      {icon}
    </Pressable>
  );
}

function SectionHeader({ title, expanded, colors, onPress }: { title: string; expanded: boolean; colors: AppColors; onPress: () => void }) {
  const { t } = useTranslation();
  const Icon = expanded ? ChevronUp : ChevronDown;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? t('collapse') : t('expand')}${title}`} onPress={onPress} style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{title}</Text>
      <Icon size={24} color={colors.text} strokeWidth={3} />
    </Pressable>
  );
}

function MetadataItem({
  label,
  value,
  align = 'left',
  full = false,
  colors,
}: {
  label: string;
  value: string;
  align?: 'left' | 'right';
  full?: boolean;
  colors: AppColors;
}) {
  return (
    <View style={[styles.metaItem, full && styles.metaItemFull, align === 'right' && styles.metaItemRight]}>
      <Text style={[styles.metaLabel, { color: colors.text }]}>{label}</Text>
      <Text style={[styles.metaValue, { color: colors.textSecondary }]} numberOfLines={full ? 1 : 2}>
        {value}
      </Text>
    </View>
  );
}

function formatEpubDate(value: string | undefined, fallback: string, language: string) {
  if (!value) return fallback;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return fallback;
  if (language === 'en') return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTimestamp(timestamp: number | null, fallback: string, language: string) {
  if (!timestamp) return fallback;
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return fallback;
  if (language === 'en') return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatFileSize(size: number | null, fallback: string) {
  if (!size || size <= 0) return fallback;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
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
    fontSize: 26,
    fontWeight: '900',
    color: Colors.light.text,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  hero: {
    flexDirection: 'row',
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  cover: {
    width: 104,
    height: 148,
    borderRadius: Radius.small,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surfaceMuted,
    overflow: 'hidden',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  fallbackCover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  format: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.light.text,
  },
  summary: {
    flex: 1,
    minHeight: 148,
    paddingTop: Spacing.one,
  },
  bookTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '900',
    color: Colors.light.text,
  },
  author: {
    marginTop: Spacing.two,
    fontSize: 18,
    lineHeight: 24,
    color: Colors.light.textSecondary,
  },
  actionRow: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  placeholderIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressedIcon: {
    opacity: 0.55,
  },
  sectionHeader: {
    marginTop: Spacing.three,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: Colors.light.textSecondary,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.four,
  },
  metaItem: {
    width: '50%',
    gap: Spacing.one,
  },
  metaItemFull: {
    width: '100%',
  },
  metaItemRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    color: Colors.light.text,
  },
  metaValue: {
    fontSize: 20,
    lineHeight: 26,
    color: Colors.light.textSecondary,
  },
  description: {
    fontSize: 20,
    lineHeight: 32,
    color: Colors.light.textSecondary,
  },
});
