import React from 'react';
import { StyleSheet } from 'react-native';
import Pdf from 'react-native-pdf';

import type { Book } from '@/types/reader';

type PdfPaneProps = {
  book: Book;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
};

export function PdfPane({ book, onProgress, onToggleToolbar }: PdfPaneProps) {
  return (
    <Pdf
      source={{ uri: book.fileUri }}
      style={styles.pdf}
      page={Math.max(1, book.currentChapter || 1)}
      enablePaging={false}
      onPageChanged={(page, total) => onProgress(total ? page / total : 0, page, page)}
      onPageSingleTap={onToggleToolbar}
    />
  );
}

const styles = StyleSheet.create({
  pdf: {
    flex: 1,
    backgroundColor: '#ECEBE6',
  },
});
