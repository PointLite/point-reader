import { BookOpen, Check } from 'lucide-react-native';
import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { AppColors } from '@/lib/theme';
import type { Book } from '@/types/reader';

type BookCardProps = {
  book: Book;
  selected: boolean;
  selectionMode: boolean;
  width: number;
  colors?: AppColors;
  onPress: () => void;
  onLongPress: () => void;
};

function BookCardBase({ book, selected, selectionMode, width, colors = Colors.light, onPress, onLongPress }: BookCardProps) {
  const progress = Math.round(book.progress * 100);
  const isRead = progress >= 99;
  const titleStyle = getTitleTextStyle(book.title);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${book.title}，${book.author}，已读 ${progress}%`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.card,
        { width },
        pressed && styles.pressed,
      ]}>
      <View
        style={[
          styles.cover,
          { height: width * 1.44, borderColor: selected ? colors.text : colors.border, backgroundColor: colors.surface },
          selected && styles.selectedCover,
        ]}>
        {book.coverUri ? (
          <Image source={{ uri: book.coverUri }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={[styles.fallbackCover, { backgroundColor: colors.surface }]}>
            <BookOpen size={30} color={colors.text} />
            <Text style={[styles.format, { color: colors.textSecondary }]}>{book.format.toUpperCase()}</Text>
          </View>
        )}
        {selected ? (
          <View style={[styles.selectedBadge, { backgroundColor: colors.text }]}>
            <Check size={18} color={colors.surface} strokeWidth={3} />
          </View>
        ) : null}
        {selectionMode && !selected ? <View style={[styles.checkbox, { borderColor: colors.text, backgroundColor: colors.surface }]} /> : null}
      </View>
      <View style={styles.meta}>
        <Text
          style={[styles.title, titleStyle, { color: colors.text }]}
          numberOfLines={2}
          ellipsizeMode="tail">
          {book.title}
        </Text>
        <View style={styles.detailRow}>
          {isRead ? (
            <Text style={[styles.readTag, { borderColor: colors.accent, backgroundColor: colors.accentSoft, color: colors.text }]}>已读</Text>
          ) : (
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>{progress}%</Text>
          )}
          <Text style={[styles.formatTag, { borderColor: colors.border, color: colors.textSecondary }]}>
            {book.format.toUpperCase()}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export const BookCard = memo(BookCardBase);

function getTitleTextStyle(title: string) {
  const weightedLength = Array.from(title).reduce((count, char) => count + (char.charCodeAt(0) > 255 ? 1 : 0.55), 0);
  if (weightedLength > 28) {
    return { fontSize: 14, lineHeight: 18 };
  }
  if (weightedLength > 20) {
    return { fontSize: 15, lineHeight: 19 };
  }
  return { fontSize: 16, lineHeight: 20 };
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.72,
  },
  cover: {
    width: '100%',
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
    backgroundColor: Colors.light.surface,
    overflow: 'hidden',
  },
  selectedCover: {
    borderWidth: 3,
    borderColor: Colors.light.text,
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
    padding: Spacing.two,
    backgroundColor: Colors.light.surface,
  },
  format: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.light.textSecondary,
  },
  meta: {
    gap: Spacing.one,
  },
  detailRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  title: {
    minHeight: 40,
    fontWeight: '900',
    color: Colors.light.text,
  },
  progressText: {
    fontSize: 15,
    lineHeight: 20,
    color: Colors.light.textSecondary,
  },
  readTag: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: Colors.light.accent,
    backgroundColor: Colors.light.accentSoft,
    color: Colors.light.text,
    fontSize: 12,
    fontWeight: '900',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  formatTag: {
    maxWidth: 56,
    borderWidth: 1,
    borderRadius: Radius.small,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '800',
    overflow: 'hidden',
  },
  checkbox: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surface,
  },
  selectedBadge: {
    position: 'absolute',
    top: Spacing.two,
    right: Spacing.two,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.light.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
