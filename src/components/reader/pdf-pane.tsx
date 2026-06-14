import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import Pdf, { type PdfRef } from 'react-native-pdf';

import type { AppColors } from '@/lib/theme';
import type { Book } from '@/types/reader';

type PdfPaneProps = {
  book: Book;
  colors: AppColors;
  seekRequest?: { progress: number; nonce: number } | null;
  turnRequest?: { delta: -1 | 1; nonce: number } | null;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
};

export function PdfPane({ book, colors, seekRequest, turnRequest, onProgress, onToggleToolbar }: PdfPaneProps) {
  const pdfRef = useRef<PdfRef>(null);
  const [initialPage] = useState(() => Math.max(1, book.currentChapter || 1));
  const source = useMemo(() => ({ uri: book.fileUri }), [book.fileUri]);
  const [pageCount, setPageCount] = useState(0);
  const currentPageRef = useRef(initialPage);

  useEffect(() => {
    if (!seekRequest || pageCount <= 0) return;
    const targetPage = Math.max(1, Math.min(pageCount, Math.round(seekRequest.progress * Math.max(1, pageCount - 1)) + 1));
    pdfRef.current?.setPage(targetPage);
    onProgress(pdfPageToProgress(targetPage, pageCount), targetPage, targetPage);
  }, [onProgress, pageCount, seekRequest]);

  useEffect(() => {
    if (!turnRequest || pageCount <= 0) return;
    const targetPage = Math.max(1, Math.min(pageCount, currentPageRef.current + turnRequest.delta));
    pdfRef.current?.setPage(targetPage);
    currentPageRef.current = targetPage;
    onProgress(pdfPageToProgress(targetPage, pageCount), targetPage, targetPage);
  }, [onProgress, pageCount, turnRequest]);

  return (
    <Pdf
      ref={pdfRef}
      source={source}
      style={[styles.pdf, { backgroundColor: colors.background }]}
      page={initialPage}
      enablePaging={false}
      onLoadComplete={(total) => setPageCount(total)}
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
