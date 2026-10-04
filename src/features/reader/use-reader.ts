import { getBook, updateBookProgress } from '@/features/library/repository';
import type { Book } from '@/features/library/types';
import { type PdfPaneHandle } from '@/features/reader/components/pdf-pane';
import { readerBackgroundFor, readerForegroundFor } from '@/features/reader/content';
import { setIosScrollsToTopEnabled } from '@/features/reader/device';
import { type EpubHtmlBook } from '@/features/reader/epub/content';
import { loadEpubHtmlBook, loadTextChapters } from '@/features/reader/epub/load';
import {
  createEpubScrollLocation,
  epubPositionProgress,
  isSameEpubHref,
  resolveEpubRestorePosition,
} from '@/features/reader/epub/position';
import { tapZoneAction } from '@/features/reader/interactions';
import { clearLastReaderBookId, setLastReaderBookId } from '@/features/reader/last-reader';
import {
  buildTextBlocks,
  chaptersForSheet,
  INITIAL_TEXT_BLOCKS,
  TEXT_BLOCK_INCREMENT,
  type TextScrollRequest,
} from '@/features/reader/text';
import type { ReaderChapter } from '@/features/reader/types';
import { addVolumeKeyListener } from '@/features/reader/volume-keys';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/features/settings/store';
import type { ReadingSettings } from '@/features/settings/types';
import { useTranslation } from '@/shared/i18n/index';
import { clamp } from '@/shared/math';
import { animateLayoutIfEnabled } from '@/shared/theme/motion';
import { appThemeFor } from '@/shared/theme/theme';
import { useToast } from '@/shared/ui/app-toast';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { AppState, Platform, useColorScheme } from 'react-native';
import { type EpubPaneHandle } from './components/epub-pane';
import { useReaderDeviceStatus } from './use-device-status';

const STYLE_PROGRESS_GUARD_MS = 2500;

const PROGRESS_SAVE_DEBOUNCE_MS = 100;

const APP_RESUME_PROGRESS_GUARD_MS = 2600;

const EPUB_REBUILD_TARGET_GUARD_MS = 5000;

const PROGRESS_BACKWARD_TOLERANCE = 0.0002;

function markRefFalse(ref: { current: boolean }) {
  ref.current = false;
}

type PendingProgress = {
  progress: number;
  chapter: number;
  offset: number;
  location?: string | null;
};

type RestoreProgressGuard = {
  bookId: string;
  progress: number;
  until: number;
};

type EpubRebuildTargetGuard = {
  index: number;
  href?: string;
  until: number;
};

type ReaderSheetState = 'toc' | 'theme' | 'progress' | 'font' | null;

export function useReaderScreenController() {
  const { t } = useTranslation();
  const showToast = useToast();
  const { bookId, entry } = useLocalSearchParams<{ bookId: string; entry?: string }>();
  const nativeColorScheme = useColorScheme();
  const systemColorScheme: 'light' | 'dark' = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [book, setBook] = useState<Book | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const { time, battery } = useReaderDeviceStatus(settings.keepAwake);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [renderedBlockCount, setRenderedBlockCount] = useState<number>(INITIAL_TEXT_BLOCKS);
  const [toolbarOpen, setToolbarOpen] = useState<boolean>(false);
  const [sheet, setSheet] = useState<ReaderSheetState>(null);
  const [epubToc, setEpubToc] = useState<ReaderChapter[]>([]);
  const [epubHtmlBook, setEpubHtmlBook] = useState<EpubHtmlBook | null>(null);
  const [textTurnRequest, setTextTurnRequest] = useState<{ delta: -1 | 1; nonce: number } | null>(null);
  const [currentEpubHref, setCurrentEpubHref] = useState<string | undefined>(undefined);
  const [epubReaderKey, setEpubReaderKey] = useState<number>(0);
  const [epubChapterTitle, setEpubChapterTitle] = useState<string>('');
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState<number>(0);
  const [textWindowStart, setTextWindowStart] = useState<number>(0);
  const [textScrollRequest, setTextScrollRequest] = useState<TextScrollRequest | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<PendingProgress | null>(null);
  const bookRef = useRef<Book | null>(null);
  const settingsRef = useRef<ReadingSettings>(defaultReadingSettings);
  const displayProgressRef = useRef(0);
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const restoreProgressGuard = useRef<RestoreProgressGuard | null>(null);
  const epubRebuildTargetGuard = useRef<EpubRebuildTargetGuard | null>(null);
  const lastToolbarToggleAt = useRef(0);
  const epubPaneRef = useRef<EpubPaneHandle>(null);
  const pdfPaneRef = useRef<PdfPaneHandle>(null);
  const requestNonce = useRef(0);

  const nextRequestNonce = () => {
    requestNonce.current += 1;
    return requestNonce.current;
  };

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return undefined;
      setIosScrollsToTopEnabled(false);
      const refreshTimer = setTimeout(() => setIosScrollsToTopEnabled(false), 500);
      return () => {
        clearTimeout(refreshTimer);
        setIosScrollsToTopEnabled(true);
      };
    }, [])
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const refreshTimer = setTimeout(() => setIosScrollsToTopEnabled(false), 80);
    return () => clearTimeout(refreshTimer);
  }, [book?.format, epubHtmlBook, epubReaderKey, settings.mode]);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

  useEffect(() => {
    displayProgressRef.current = displayProgress;
  }, [displayProgress]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      async function load() {
        try {
          if (!bookId) return;
          const [nextBook, nextSettings] = await Promise.all([getBook(bookId), loadReadingSettings()]);
          if (!mounted) return;
          setSettings(nextSettings);
          if (!nextBook) {
            setBook(null);
            setChapters([]);
            setTextWindowStart(0);
            setTextScrollRequest(null);
            return;
          }
          void setLastReaderBookId(nextBook.id);
          setDisplayProgress(nextBook?.progress ?? 0);
          setCurrentChapterIndex(nextBook?.currentChapter ?? 0);
          restoreProgressGuard.current =
            nextBook && nextBook.progress > 0.005
              ? { bookId: nextBook.id, progress: nextBook.progress, until: Date.now() + 6000 }
              : null;
          setCurrentEpubHref(undefined);
          setEpubReaderKey((key) => key + 1);
          setEpubChapterTitle('');
          setEpubHtmlBook(null);
          epubRebuildTargetGuard.current = null;
          setTextTurnRequest(null);
          if (nextBook?.format === 'txt') {
            const nextChapters = await loadTextChapters(nextBook);
            if (!mounted) return;
            const nextTextBlocks = buildTextBlocks(nextChapters);
            const restoredOffset = Math.round(
              clamp(Math.floor(nextBook.currentOffset), 0, Math.max(0, nextTextBlocks.length - 1))
            );
            const windowStart = Math.max(0, restoredOffset - 2);
            const restoredBook = { ...nextBook, currentOffset: restoredOffset };
            const restoredChapter = nextTextBlocks[restoredOffset]?.chapterIndex ?? nextBook.currentChapter;
            setBook(restoredBook);
            setCurrentChapterIndex(restoredChapter);
            setChapters(nextChapters);
            setTextWindowStart(windowStart);
            setTextScrollRequest(null);
            setRenderedBlockCount(
              Math.min(
                nextTextBlocks.length,
                Math.max(windowStart + INITIAL_TEXT_BLOCKS, restoredOffset + TEXT_BLOCK_INCREMENT)
              )
            );
          } else if (nextBook.format === 'epub') {
            const nextEpub = await loadEpubHtmlBook(nextBook.fileUri);
            if (!mounted) return;
            setChapters([]);
            setTextWindowStart(0);
            setTextScrollRequest(null);
            const tocItems = nextEpub.toc.length
              ? nextEpub.toc
              : nextEpub.chapters.map((chapter) => ({
                  id: chapter.id,
                  href: chapter.href,
                  title: chapter.title.trim(),
                }));
            setEpubToc(
              tocItems.flatMap((chapter) => {
                const title = chapter.title.trim();
                return title ? [{ id: chapter.id, href: chapter.href, title, text: '' }] : [];
              })
            );
            const { index: restoredIndex, offset: restoredOffset } = resolveEpubRestorePosition(
              nextBook,
              nextEpub
            );
            const restoredBook = {
              ...nextBook,
              currentChapter: restoredIndex,
              currentOffset: restoredOffset,
            };
            setBook(restoredBook);
            setCurrentChapterIndex(restoredIndex);
            setCurrentEpubHref(nextEpub.chapters[restoredIndex]?.href);
            setEpubChapterTitle(nextEpub.chapters[restoredIndex]?.title ?? '');
            setEpubHtmlBook(nextEpub);
          } else {
            setBook(nextBook);
            setChapters([]);
            setTextWindowStart(0);
            setTextScrollRequest(null);
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

  const backgroundColor = readerBackgroundFor(settings, systemColorScheme);
  const foregroundColor = readerForegroundFor(settings, systemColorScheme);
  const readerIsDark =
    settings.colorScheme === 'dark' || (settings.colorScheme === 'system' && systemColorScheme === 'dark');
  const readerChromeColors = appThemeFor(settings.colorScheme, systemColorScheme).colors;
  const toolbarSurface = readerChromeColors.surface;
  const toolbarBorder = readerChromeColors.border;
  const toolbarIconColor = readerChromeColors.textSecondary;
  const toolbarIconActiveColor = readerChromeColors.text;
  const isPdfBook = book?.format === 'pdf';
  const themeToolDisabled = readerIsDark || isPdfBook;
  const fontToolDisabled = isPdfBook;
  const disabledReaderSheets: ('theme' | 'font')[] = [];
  if (themeToolDisabled) disabledReaderSheets.push('theme');
  if (fontToolDisabled) disabledReaderSheets.push('font');
  const visibleSheet =
    (sheet === 'theme' && themeToolDisabled) || (sheet === 'font' && fontToolDisabled) ? null : sheet;

  const updateSettings = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettings(next);
    try {
      await saveReadingSettings(next);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t('operationFailed'));
    }
  };

  const flushProgressSave = useCallback(async () => {
    const currentBook = bookRef.current;
    const pending = pendingProgress.current;
    if (!currentBook || !pending) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingProgress.current = null;
    try {
      await updateBookProgress(
        currentBook.id,
        pending.progress,
        pending.chapter,
        pending.offset,
        pending.location
      );
    } catch (error) {
      if (mountedRef.current) {
        showToast(error instanceof Error ? error.message : t('operationFailed'));
      }
      return;
    }
    if (mountedRef.current) {
      setBook((current) =>
        current?.id === currentBook.id
          ? {
              ...current,
              progress: pending.progress,
              currentChapter: pending.chapter,
              currentOffset: pending.offset,
              currentLocation: pending.location ?? current.currentLocation,
            }
          : current
      );
    }
  }, [showToast, t]);

  const rebuildEpubReader = async () => {
    if (!mountedRef.current) return;
    await flushProgressSave();
    if (mountedRef.current) {
      setEpubReaderKey((key) => key + 1);
    }
  };

  const guardCurrentProgress = (duration = APP_RESUME_PROGRESS_GUARD_MS) => {
    const currentBook = bookRef.current;
    if (!currentBook || currentBook.format !== 'epub') return;
    const progress = Math.max(displayProgressRef.current, currentBook.progress);
    if (progress <= 0.005) return;
    restoreProgressGuard.current = {
      bookId: currentBook.id,
      progress,
      until: Date.now() + duration,
    };
  };
  const flushProgressSaveEvent = useEffectEvent(() => {
    void flushProgressSave();
  });
  const guardCurrentProgressEvent = useEffectEvent((duration?: number) => {
    guardCurrentProgress(duration);
  });
  const flushProgressSaveOnUnmount = useEffectEvent(() => {
    void flushProgressSave();
  });

  useEffect(() => {
    return () => {
      markRefFalse(mountedRef);
      flushProgressSaveOnUnmount();
    };
  }, []);

  useFocusEffect(
    useCallback(
      () => () => {
        void flushProgressSave();
      },
      [flushProgressSave]
    )
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (nextState !== 'active') {
        guardCurrentProgressEvent(APP_RESUME_PROGRESS_GUARD_MS + 1200);
        flushProgressSaveEvent();
        return;
      }

      if (previousState === 'active') return;
      const currentBook = bookRef.current;
      if (currentBook?.format !== 'epub') return;
      guardCurrentProgressEvent();
      epubPaneRef.current?.resume();
    });
    return () => subscription.remove();
  }, []);

  const scheduleProgressSave = (
    progress: number,
    chapter: number,
    offset: number,
    location?: string | null
  ) => {
    const nextProgress = Math.max(0, Math.min(1, progress));
    const currentBook = bookRef.current;
    const guard = restoreProgressGuard.current;
    if (
      currentBook &&
      guard?.bookId === currentBook.id &&
      Date.now() < guard.until &&
      nextProgress + PROGRESS_BACKWARD_TOLERANCE < guard.progress
    ) {
      return false;
    }
    if (!guard || nextProgress + PROGRESS_BACKWARD_TOLERANCE >= guard.progress) {
      restoreProgressGuard.current = null;
    }
    setDisplayProgress(nextProgress);
    setCurrentChapterIndex(chapter);
    pendingProgress.current = {
      progress: nextProgress,
      chapter,
      offset,
      location,
    };
    if (!currentBook) return true;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void flushProgressSave();
    }, PROGRESS_SAVE_DEBOUNCE_MS);
    return true;
  };

  const textBlocks = buildTextBlocks(chapters);
  const visibleTextBlocks = (() => {
    const end = Math.min(
      Math.max(renderedBlockCount, textWindowStart + INITIAL_TEXT_BLOCKS),
      textBlocks.length
    );
    return textBlocks.slice(textWindowStart, end);
  })();

  const closeToolbar = () => {
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setSheet(null);
    setToolbarOpen(false);
  };
  const toggleToolbar = () => {
    const now = Date.now();
    if (now - lastToolbarToggleAt.current < 260) return;
    lastToolbarToggleAt.current = now;
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setToolbarOpen((value) => {
      if (value) setSheet(null);
      return !value;
    });
  };
  const openImagePreview = (uri: string) => {
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setSheet(null);
    setToolbarOpen(false);
    setPreviewImageUri(uri);
  };
  const guardProgressForStyleChange = () => {
    const currentBook = bookRef.current;
    if (!currentBook || displayProgress <= 0.005) return;
    restoreProgressGuard.current = {
      bookId: currentBook.id,
      progress: displayProgress,
      until: Date.now() + STYLE_PROGRESS_GUARD_MS,
    };
  };

  const seekToProgress = (progress: number) => {
    const nextProgress = clamp(progress, 0, 1);
    const currentBook = bookRef.current;
    if (!currentBook) return;

    if (currentBook.format === 'epub' && epubHtmlBook?.chapters.length) {
      const absolute = nextProgress * epubHtmlBook.chapters.length;
      const index = Math.min(epubHtmlBook.chapters.length - 1, Math.max(0, Math.floor(absolute)));
      const offset =
        index === epubHtmlBook.chapters.length - 1 && nextProgress >= 0.999
          ? 1
          : clamp(absolute - index, 0, 1);
      const href = epubHtmlBook.chapters[index]?.href ?? '';
      restoreProgressGuard.current = null;
      setCurrentChapterIndex(index);
      setCurrentEpubHref(href);
      setEpubChapterTitle(epubHtmlBook.chapters[index]?.title ?? '');
      epubPaneRef.current?.seekToProgress(nextProgress);
      scheduleProgressSave(nextProgress, index, offset, createEpubScrollLocation(index, offset, href));
      return;
    }

    if (currentBook.format === 'txt' && textBlocks.length) {
      const blockIndex = Math.round(nextProgress * Math.max(0, textBlocks.length - 1));
      const block = textBlocks[blockIndex];
      if (!block) return;
      setTextWindowStart(Math.max(0, blockIndex - 2));
      setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, blockIndex + TEXT_BLOCK_INCREMENT * 3));
      setTextScrollRequest({ blockIndex, nonce: nextRequestNonce() });
      scheduleProgressSave(nextProgress, block.chapterIndex, block.blockIndex);
      return;
    }

    if (currentBook.format === 'pdf') {
      pdfPaneRef.current?.seekToProgress(nextProgress);
    }
  };
  const turnReaderPage = (delta: -1 | 1) => {
    const currentBook = bookRef.current;
    if (!currentBook || settingsRef.current.mode !== 'tap') return;
    const resolvedDelta = settingsRef.current.swapTapZones ? ((delta * -1) as -1 | 1) : delta;
    if (currentBook.format === 'epub') {
      epubPaneRef.current?.turnPage(resolvedDelta);
      return;
    }
    if (currentBook.format === 'pdf') {
      pdfPaneRef.current?.turnPage(resolvedDelta);
      return;
    }
    setTextTurnRequest({ delta: resolvedDelta, nonce: nextRequestNonce() });
  };
  const turnReaderPageEvent = useEffectEvent((delta: -1 | 1) => {
    turnReaderPage(delta);
  });

  useEffect(() => {
    if (!settings.volumeTurnPage || settings.mode !== 'tap') return undefined;
    const subscription = addVolumeKeyListener((direction) => {
      turnReaderPageEvent(direction === 'up' ? 1 : -1);
    });
    return () => subscription.remove();
  }, [settings.mode, settings.volumeTurnPage]);

  const handleEpubProgress = (
    progress: number,
    chapterIndex: number,
    href: string,
    chapterOffset: number
  ) => {
    const rebuildGuard = epubRebuildTargetGuard.current;
    if (rebuildGuard) {
      if (Date.now() >= rebuildGuard.until) {
        epubRebuildTargetGuard.current = null;
      } else {
        const reachedTarget = chapterIndex === rebuildGuard.index || isSameEpubHref(href, rebuildGuard.href);
        if (!reachedTarget) return;
        epubRebuildTargetGuard.current = null;
      }
    }

    const accepted = scheduleProgressSave(
      progress,
      chapterIndex,
      chapterOffset,
      createEpubScrollLocation(chapterIndex, chapterOffset, href)
    );
    if (!accepted) return;
    const chapter = epubHtmlBook?.chapters[chapterIndex];
    setCurrentEpubHref(href);
    if (chapter?.title) {
      setEpubChapterTitle((current) => (current === chapter.title ? current : chapter.title));
    }
  };

  const closeReader = async () => {
    const shouldReplace = entry === 'restore';
    await flushProgressSave();
    await clearLastReaderBookId(bookRef.current?.id);
    if (shouldReplace) {
      router.replace('/');
    } else {
      router.back();
    }
  };
  const handlePagedEpubTap = (x: number, pageWidth: number) => {
    if (settingsRef.current.showPageButtons) {
      toggleToolbar();
      return;
    }
    const action = tapZoneAction(x, pageWidth, settingsRef.current.swapTapZones);
    if (action === 'toolbar') {
      toggleToolbar();
      return;
    }
    epubPaneRef.current?.turnPage(action === 'next' ? 1 : -1);
  };

  const progressText = `${(displayProgress * 100).toFixed(1)}%`;
  const currentChapterTitle =
    book?.format === 'txt'
      ? chapters[currentChapterIndex]?.title || book.title
      : epubChapterTitle || book?.title || '';
  const sheetChapters = book ? chaptersForSheet(book.format, epubToc, chapters) : [];
  const showReaderPageButtons =
    book?.format === 'epub' && settings.mode === 'tap' && settings.showPageButtons;

  const selectChapter = (index: number, href?: string) => {
    if (!book) return;
    setCurrentChapterIndex(index);
    if (book.format === 'epub' && href) {
      const chapterCount = epubHtmlBook?.chapters.length ?? epubToc.length;
      const estimatedProgress = epubPositionProgress(index, 0, chapterCount);
      const title =
        epubToc.find((chapter) => isSameEpubHref(chapter.href, href))?.title ?? epubToc[index]?.title;
      const location = createEpubScrollLocation(index, 0, href);
      const nextBook = {
        ...book,
        progress: estimatedProgress,
        currentChapter: index,
        currentOffset: 0,
        currentLocation: location,
      };
      restoreProgressGuard.current = null;
      epubRebuildTargetGuard.current = {
        index,
        href,
        until: deadlineFromNow(EPUB_REBUILD_TARGET_GUARD_MS),
      };
      bookRef.current = nextBook;
      setBook(nextBook);
      setDisplayProgress(estimatedProgress);
      setCurrentEpubHref(href);
      if (title) {
        setEpubChapterTitle(title);
      }
      scheduleProgressSave(estimatedProgress, index, 0, location);
      setEpubReaderKey((key) => key + 1);
    } else {
      const targetBlock = textBlocks.find((block) => block.chapterIndex === index);
      const nextOffset = targetBlock?.blockIndex ?? 0;
      setTextWindowStart(nextOffset);
      setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, nextOffset + TEXT_BLOCK_INCREMENT * 3));
      setTextScrollRequest({ blockIndex: nextOffset, nonce: nextRequestNonce() });
      const nextProgress = textBlocks.length ? nextOffset / textBlocks.length : 0;
      scheduleProgressSave(nextProgress, index, nextOffset);
    }
    closeToolbar();
  };

  const resolveSheetChapterIndex = (href: string | undefined, fallbackIndex: number) => {
    if (!href || book?.format !== 'epub' || !epubHtmlBook) return fallbackIndex;
    const index = epubHtmlBook.chapters.findIndex((chapter) => isSameEpubHref(chapter.href, href));
    return index >= 0 ? index : fallbackIndex;
  };

  return {
    backgroundColor,
    battery,
    book,
    chapters,
    closeReader,
    closeToolbar,
    currentChapterHref: book?.format === 'epub' ? currentEpubHref : undefined,
    currentChapterIndex,
    currentChapterTitle,
    disabledReaderSheets,
    displayProgress,
    epubHtmlBook,
    epubPaneRef,
    epubReaderKey,
    fontToolDisabled,
    foregroundColor,
    guardProgressForStyleChange,
    handleEpubProgress,
    handlePagedEpubTap,
    openImagePreview,
    pdfPaneRef,
    previewImageUri,
    progressText,
    readerChromeColors,
    readerIsDark,
    rebuildEpubReader,
    resolveSheetChapterIndex,
    scheduleProgressSave,
    seekToProgress,
    selectChapter,
    setPreviewImageUri,
    setRenderedBlockCount,
    setSheet,
    setToolbarOpen,
    settings,
    sheetChapters,
    showReaderPageButtons,
    systemColorScheme,
    t,
    textBlocks,
    textScrollRequest,
    textTurnRequest,
    textWindowStart,
    themeToolDisabled,
    time,
    toggleToolbar,
    toolbarBorder,
    toolbarIconActiveColor,
    toolbarIconColor,
    toolbarOpen,
    toolbarSurface,
    updateSettings,
    visibleSheet,
    visibleTextBlocks,
  };
}

function deadlineFromNow(duration: number) {
  return Date.now() + duration;
}
