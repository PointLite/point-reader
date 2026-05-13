import { BookOpen, Check } from 'lucide-react-native';
import React, { memo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/constants/theme';
import type { Book } from '@/types/reader';

type BookCardProps = {
  book: Book;
  selected: boolean;
  selectionMode: boolean;
  width: number;
  onPress: () => void;
  onLongPress: () => void;
};

function BookCardBase({ book, selected, selectionMode, width, onPress, onLongPress }: BookCardProps) {
  const progress = Math.round(book.progress * 100);
  const isRead = progress >= 99;

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
      <View style={[styles.cover, { height: width * 1.44 }, selected && styles.selectedCover]}>
        {book.coverUri ? (
          <Image source={{ uri: book.coverUri }} style={styles.coverImage} resizeMode="cover" />
        ) : (
          <View style={styles.fallbackCover}>
            <BookOpen size={30} color={Colors.light.text} />
            <Text style={styles.format}>{book.format.toUpperCase()}</Text>
          </View>
        )}
        {selected ? (
          <View style={styles.selectedBadge}>
            <Check size={18} color={Colors.light.surface} strokeWidth={3} />
          </View>
        ) : null}
        {selectionMode && !selected ? <View style={styles.checkbox} /> : null}
      </View>
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={1}>
          {book.title}
        </Text>
        {isRead ? (
          <Text style={styles.readTag}>已读</Text>
        ) : (
          <Text style={styles.progressText}>{progress}%</Text>
        )}
      </View>
    </Pressable>
  );
}

export const BookCard = memo(BookCardBase);

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
  title: {
    fontSize: 16,
    lineHeight: 21,
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
