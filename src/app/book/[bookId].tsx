import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { ChevronLeft, Trash2 } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InkButton } from '@/components/ink-button';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { deleteBooks, getBook } from '@/lib/books';
import type { Book } from '@/types/reader';

export default function BookDetailScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
  const [book, setBook] = useState<Book | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (bookId) getBook(bookId).then(setBook);
    }, [bookId])
  );

  const remove = () => {
    if (!book) return;
    Alert.alert('删除书籍', `确定删除《${book.title}》？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteBooks([book.id]);
          router.replace('/');
        },
      },
    ]);
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
        <Text style={styles.title}>书籍详情</Text>
      </View>

      {book ? (
        <View style={styles.content}>
          <View style={styles.cover}>
            <Text style={styles.format}>{book.format.toUpperCase()}</Text>
          </View>
          <View style={styles.panel}>
            <Text style={styles.bookTitle}>{book.title}</Text>
            <Text style={styles.author}>{book.author}</Text>
            <Detail label="格式" value={book.format.toUpperCase()} />
            <Detail label="阅读进度" value={`${Math.round(book.progress * 100)}%`} />
            <Detail label="章节位置" value={`第 ${book.currentChapter + 1} 节`} />
            <Detail label="文件路径" value={book.fileUri} />
          </View>
          <InkButton
            label="继续阅读"
            variant="primary"
            onPress={() => router.push({ pathname: '/reader/[bookId]', params: { bookId: book.id } })}
          />
          <InkButton label="删除书籍" icon={Trash2} variant="danger" onPress={remove} />
        </View>
      ) : (
        <View style={styles.content}>
          <Text style={styles.author}>没有找到这本书。</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
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
    fontSize: 26,
    fontWeight: '900',
    color: Colors.light.text,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  cover: {
    width: 132,
    height: 184,
    borderRadius: Radius.medium,
    borderWidth: 2,
    borderColor: Colors.light.text,
    backgroundColor: Colors.light.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  format: {
    fontSize: 22,
    fontWeight: '900',
    color: Colors.light.text,
  },
  panel: {
    borderWidth: 1,
    borderColor: Colors.light.border,
    borderRadius: Radius.medium,
    backgroundColor: Colors.light.surface,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  bookTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    color: Colors.light.text,
  },
  author: {
    fontSize: 16,
    color: Colors.light.textSecondary,
  },
  detail: {
    gap: Spacing.one,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: Colors.light.textSecondary,
  },
  detailValue: {
    fontSize: 15,
    lineHeight: 21,
    color: Colors.light.text,
  },
});
