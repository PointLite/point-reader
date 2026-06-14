import React, { useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Pdf, { type PdfRef } from 'react-native-pdf';

import type { AppColors } from '@/lib/theme';
import type { Book } from '@/types/reader';

type PdfPaneProps = {
  ref?: React.Ref<PdfPaneHandle>;
  book: Book;
  colors: AppColors;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
};

export type PdfPaneHandle = {
  seekToProgress: (progress: number) => void;
  turnPage: (delta: -1 | 1) => void;
};

export function PdfPane({ ref, book, colors, onProgress, onToggleToolbar }: PdfPaneProps) {
  const pdfRef = useRef<PdfRef>(null);
  const [initialPage] = useState(() => Math.max(1, book.currentChapter || 1));
  const source = { uri: book.fileUri };
  const pageCountRef = useRef(0);
  const currentPageRef = useRef(initialPage);

  const seekToProgress = (progress: number) => {
    const pageCount = pageCountRef.current;
    if (pageCount <= 0) return;
    const targetPage = Math.max(1, Math.min(pageCount, Math.round(progress * Math.max(1, pageCount - 1)) + 1));
    pdfRef.current?.setPage(targetPage);
    currentPageRef.current = targetPage;
    onProgress(pdfPageToProgress(targetPage, pageCount), targetPage, targetPage);
  };

  const turnPage = (delta: -1 | 1) => {
    const pageCount = pageCountRef.current;
    if (pageCount <= 0) return;
    const targetPage = Math.max(1, Math.min(pageCount, currentPageRef.current + delta));
    pdfRef.current?.setPage(targetPage);
    currentPageRef.current = targetPage;
    onProgress(pdfPageToProgress(targetPage, pageCount), targetPage, targetPage);
  };

  useImperativeHandle(ref, () => ({
    seekToProgress,
    turnPage,
  }));

  return (
    <Pdf
      ref={pdfRef}
      source={source}
      style={[styles.pdf, { backgroundColor: colors.background }]}
      page={initialPage}
      enablePaging={false}
      onLoadComplete={(total) => {
        pageCountRef.current = total;
      }}
      onPageChanged={(page, total) => {
        currentPageRef.current = page;
        onProgress(pdfPageToProgress(page, total), page, page);
      }}
      onPageSingleTap={onToggleToolbar}
    />
  );
}

function pdfPageToProgress(page: number, total: number) {
  if (total <= 1) return 0;
  return Math.max(0, Math.min(1, (page - 1) / (total - 1)));
}

const styles = StyleSheet.create({
  pdf: {
    flex: 1,
    backgroundColor: '#ECEBE6',
  },
});
