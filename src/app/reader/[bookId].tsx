import * as Battery from 'expo-battery';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronLeft,
  ChevronRight,
  List,
  Sun,
  Type,
  X,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ListRenderItemInfo,
  type ViewToken,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useToast } from '@/components/app-toast';
import { EpubPagedPane, type EpubPagedSeekRequest } from '@/components/reader/epub-paged-pane';
import { EpubScrollPane, type EpubSeekRequest } from '@/components/reader/epub-scroll-pane';
import { ImagePreviewModal } from '@/components/reader/image-preview-modal';
import { ProgressToolIcon, ReaderSheet } from '@/components/reader/reader-sheet';
import { PdfPane } from '@/components/reader/pdf-pane';
import { Colors, Spacing, TouchTarget } from '@/constants/theme';
import { getBook, updateBookProgress } from '@/lib/books';
import { loadEpubHtmlBook, type EpubHtmlBook } from '@/lib/epubContent';
import { clearLastReaderBookId, setLastReaderBookId } from '@/lib/lastReader';
import { useTranslation } from '@/lib/i18n';
import { animateLayoutIfEnabled } from '@/lib/motion';
import {
  fontFamilyFor,
  loadTextChapters,
  readerBackgroundFor,
  readerForeground,
  readerForegroundFor,
} from '@/lib/readerContent';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import { addVolumeKeyListener } from '@/lib/volumeKeys';
import type { Book, ReaderChapter, ReadingSettings } from '@/types/reader';

const KEEP_AWAKE_TAG = 'point-reader:reader';
const INITIAL_TEXT_BLOCKS = 18;
const TEXT_BLOCK_INCREMENT = 12;
const STYLE_PROGRESS_GUARD_MS = 2500;
const PROGRESS_SAVE_DEBOUNCE_MS = 100;
const BATTERY_REFRESH_INTERVAL_MS = 30000;
const READER_TOOLBAR_HEIGHT = 68;
const ACTIVE_TOOL_COLOR = '#3478F6';
const BATTERY_BODY_WIDTH = 26;
const BATTERY_BODY_HEIGHT = 14;
const TAP_ZONE_EDGE_RATIO = 0.35;
const EPUB_RESUME_REBUILD_THRESHOLD_MS = 1200;

type TapZoneAction = 'previous' | 'toolbar' | 'next';

type TextBlock = {
  id: string;
  chapterIndex: number;
  blockIndex: number;
  title?: string;
  text: string;
};

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

type TextScrollRequest = {
  blockIndex: number;
  nonce: number;
};

type PdfSeekRequest = {
  progress: number;
  nonce: number;
};

export default function ReaderScreen() {
  const { t } = useTranslation();
  const showToast = useToast();
  const { bookId, entry } = useLocalSearchParams<{ bookId: string; entry?: string }>();
  const nativeColorScheme = useColorScheme();
  const systemColorScheme = nativeColorScheme === 'dark' ? 'dark' : 'light';
  const [book, setBook] = useState<Book | null>(null);
  const [settings, setSettings] = useState<ReadingSettings>(defaultReadingSettings);
  const [chapters, setChapters] = useState<ReaderChapter[]>([]);
  const [renderedBlockCount, setRenderedBlockCount] = useState(INITIAL_TEXT_BLOCKS);
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const [sheet, setSheet] = useState<'toc' | 'theme' | 'progress' | 'font' | null>(null);
  const [time, setTime] = useState('');
  const [battery, setBattery] = useState<number | null>(null);
  const [epubToc, setEpubToc] = useState<ReaderChapter[]>([]);
  const [epubHtmlBook, setEpubHtmlBook] = useState<EpubHtmlBook | null>(null);
  const [epubJumpRequest, setEpubJumpRequest] = useState<{ index: number; nonce: number } | null>(null);
  const [epubSeekRequest, setEpubSeekRequest] = useState<EpubSeekRequest | null>(null);
  const [epubPagedSeekRequest, setEpubPagedSeekRequest] = useState<EpubPagedSeekRequest | null>(null);
  const [epubPagedTurnRequest, setEpubPagedTurnRequest] = useState<{ delta: -1 | 1; nonce: number } | null>(null);
  const [pdfSeekRequest, setPdfSeekRequest] = useState<PdfSeekRequest | null>(null);
  const [pdfTurnRequest, setPdfTurnRequest] = useState<{ delta: -1 | 1; nonce: number } | null>(null);
  const [textTurnRequest, setTextTurnRequest] = useState<{ delta: -1 | 1; nonce: number } | null>(null);
  const [currentEpubHref, setCurrentEpubHref] = useState<string | undefined>(undefined);
  const [epubReaderKey, setEpubReaderKey] = useState(0);
  const [epubChapterTitle, setEpubChapterTitle] = useState('');
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [currentChapterIndex, setCurrentChapterIndex] = useState(0);
  const [textWindowStart, setTextWindowStart] = useState(0);
  const [textScrollRequest, setTextScrollRequest] = useState<TextScrollRequest | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingProgress = useRef<PendingProgress | null>(null);
  const bookRef = useRef<Book | null>(null);
  const settingsRef = useRef<ReadingSettings>(defaultReadingSettings);
  const mountedRef = useRef(true);
  const appStateRef = useRef(AppState.currentState);
  const backgroundedAtRef = useRef<number | null>(null);
  const restoreProgressGuard = useRef<RestoreProgressGuard | null>(null);
  const lastToolbarToggleAt = useRef(0);

  useEffect(() => {
    bookRef.current = book;
  }, [book]);

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
          setEpubSeekRequest(null);
          setEpubPagedSeekRequest(null);
          setEpubPagedTurnRequest(null);
          setPdfTurnRequest(null);
          setTextTurnRequest(null);
          if (nextBook?.format === 'txt') {
            const nextChapters = await loadTextChapters(nextBook);
            if (!mounted) return;
            const nextTextBlocks = buildTextBlocks(nextChapters);
            const restoredOffset = Math.round(clamp(Math.floor(nextBook.currentOffset), 0, Math.max(0, nextTextBlocks.length - 1)));
            const windowStart = Math.max(0, restoredOffset - 2);
            const restoredBook = { ...nextBook, currentOffset: restoredOffset };
            const restoredChapter = nextTextBlocks[restoredOffset]?.chapterIndex ?? nextBook.currentChapter;
            setBook(restoredBook);
            setCurrentChapterIndex(restoredChapter);
            setChapters(nextChapters);
            setTextWindowStart(windowStart);
            setTextScrollRequest(null);
            setRenderedBlockCount(Math.min(nextTextBlocks.length, Math.max(windowStart + INITIAL_TEXT_BLOCKS, restoredOffset + TEXT_BLOCK_INCREMENT)));
          } else if (nextBook.format === 'epub') {
            const nextEpub = await loadEpubHtmlBook(nextBook.fileUri);
            if (!mounted) return;
            setChapters([]);
            setTextWindowStart(0);
            setTextScrollRequest(null);
            setEpubToc(
              nextEpub.chapters
                .map((chapter) => ({ id: chapter.id, href: chapter.href, title: chapter.title.trim(), text: '' }))
                .filter((chapter) => chapter.title.length > 0)
            );
            const { index: restoredIndex, offset: restoredOffset } = resolveEpubRestorePosition(nextBook, nextEpub);
            const restoredBook = { ...nextBook, currentChapter: restoredIndex, currentOffset: restoredOffset };
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

  useEffect(() => {
    if (settings.keepAwake) {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG);
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG);
      };
    }
    return undefined;
  }, [settings.keepAwake]);

  useEffect(() => {
    let mounted = true;
    const refreshStatus = async () => {
      const now = new Date();
      setTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
      const nextBattery = await readBatteryPercent();
      if (mounted && nextBattery !== null) {
        setBattery(nextBattery);
      }
    };
    let batteryLevelSubscription: Battery.Subscription | null = null;
    let batteryStateSubscription: Battery.Subscription | null = null;
    try {
      batteryLevelSubscription = Battery.addBatteryLevelListener((event) => {
        const nextBattery = batteryPercentFromLevel(event.batteryLevel);
        if (mounted && nextBattery !== null) {
          setBattery(nextBattery);
        }
      });
      batteryStateSubscription = Battery.addBatteryStateListener(() => {
        void refreshStatus();
      });
    } catch {
      batteryLevelSubscription = null;
      batteryStateSubscription = null;
    }
    const retryTimers = [120, 650, 1800, 3500].map((delay) => setTimeout(refreshStatus, delay));
    const timer = setInterval(refreshStatus, BATTERY_REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      retryTimers.forEach(clearTimeout);
      clearInterval(timer);
      batteryLevelSubscription?.remove();
      batteryStateSubscription?.remove();
    };
  }, [showToast, t]);

  const backgroundColor = readerBackgroundFor(settings, systemColorScheme);
  const foregroundColor = readerForegroundFor(settings, systemColorScheme);
  const readerIsDark = settings.colorScheme === 'dark' || (settings.colorScheme === 'system' && systemColorScheme === 'dark');
  const toolbarSurface = readerIsDark ? Colors.dark.surface : Colors.light.surface;
  const toolbarBorder = readerIsDark ? 'rgba(245,245,244,0.16)' : 'rgba(28,25,23,0.16)';

  const updateSettings = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settings, ...patch };
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
      await updateBookProgress(currentBook.id, pending.progress, pending.chapter, pending.offset, pending.location);
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

  const rebuildEpubReader = useCallback(async () => {
    await flushProgressSave();
    if (!mountedRef.current) return;
    setEpubReaderKey((key) => key + 1);
  }, [flushProgressSave]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      void flushProgressSave();
    };
  }, [flushProgressSave]);

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
        if (previousState === 'active') {
          backgroundedAtRef.current = Date.now();
        }
        void flushProgressSave();
        return;
      }

      if (previousState === 'active') return;
      const backgroundedAt = backgroundedAtRef.current;
      backgroundedAtRef.current = null;
      const elapsed = backgroundedAt ? Date.now() - backgroundedAt : 0;
      const currentBook = bookRef.current;
      if (currentBook?.format !== 'epub' || elapsed < EPUB_RESUME_REBUILD_THRESHOLD_MS) return;
      void rebuildEpubReader();
    });
    return () => subscription.remove();
  }, [flushProgressSave, rebuildEpubReader]);

  const scheduleProgressSave = useCallback(
    (progress: number, chapter: number, offset: number, location?: string | null) => {
      const nextProgress = Math.max(0, Math.min(1, progress));
      const currentBook = bookRef.current;
      const guard = restoreProgressGuard.current;
      if (
        currentBook &&
        guard?.bookId === currentBook.id &&
        Date.now() < guard.until &&
        nextProgress + 0.005 < guard.progress
      ) {
        return;
      }
      restoreProgressGuard.current = null;
      setDisplayProgress(nextProgress);
      setCurrentChapterIndex(chapter);
      pendingProgress.current = {
        progress: nextProgress,
        chapter,
        offset,
        location,
      };
      if (!currentBook) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flushProgressSave();
      }, PROGRESS_SAVE_DEBOUNCE_MS);
    },
    [flushProgressSave]
  );

  const textBlocks = useMemo(() => buildTextBlocks(chapters), [chapters]);
  const visibleTextBlocks = useMemo(
    () => {
      const end = Math.min(Math.max(renderedBlockCount, textWindowStart + INITIAL_TEXT_BLOCKS), textBlocks.length);
      return textBlocks.slice(textWindowStart, end);
    },
    [renderedBlockCount, textBlocks, textWindowStart]
  );

  const closeToolbar = useCallback(() => {
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setSheet(null);
    setToolbarOpen(false);
  }, []);
  const toggleToolbar = useCallback(() => {
    const now = Date.now();
    if (now - lastToolbarToggleAt.current < 260) return;
    lastToolbarToggleAt.current = now;
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setToolbarOpen((value) => {
      if (value) setSheet(null);
      return !value;
    });
  }, []);
  const openImagePreview = useCallback((uri: string) => {
    animateLayoutIfEnabled(settingsRef.current.einkOptimization);
    setSheet(null);
    setToolbarOpen(false);
    setPreviewImageUri(uri);
  }, []);
  const guardProgressForStyleChange = useCallback(() => {
    const currentBook = bookRef.current;
    if (!currentBook || displayProgress <= 0.005) return;
    restoreProgressGuard.current = {
      bookId: currentBook.id,
      progress: displayProgress,
      until: Date.now() + STYLE_PROGRESS_GUARD_MS,
    };
  }, [displayProgress]);
  const seekToProgress = useCallback(
    (progress: number) => {
      const nextProgress = clamp(progress, 0, 1);
      const currentBook = bookRef.current;
      if (!currentBook) return;

      if (currentBook.format === 'epub' && epubHtmlBook?.chapters.length) {
        const absolute = nextProgress * epubHtmlBook.chapters.length;
        const index = Math.min(epubHtmlBook.chapters.length - 1, Math.max(0, Math.floor(absolute)));
        const offset = index === epubHtmlBook.chapters.length - 1 && nextProgress >= 0.999 ? 1 : clamp(absolute - index, 0, 1);
        const href = epubHtmlBook.chapters[index]?.href ?? '';
        setCurrentChapterIndex(index);
        setCurrentEpubHref(href);
        setEpubChapterTitle(epubHtmlBook.chapters[index]?.title ?? '');
        if (settingsRef.current.mode === 'scroll') {
          setEpubSeekRequest({ progress: nextProgress, nonce: Date.now() });
        } else {
          setEpubPagedSeekRequest({ progress: nextProgress, nonce: Date.now() });
        }
        scheduleProgressSave(nextProgress, index, offset, createEpubScrollLocation(index, offset, href));
        return;
      }

      if (currentBook.format === 'txt' && textBlocks.length) {
        const blockIndex = Math.round(nextProgress * Math.max(0, textBlocks.length - 1));
        const block = textBlocks[blockIndex];
        if (!block) return;
        setTextWindowStart(Math.max(0, blockIndex - 2));
        setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, blockIndex + TEXT_BLOCK_INCREMENT * 3));
        setTextScrollRequest({ blockIndex, nonce: Date.now() });
        scheduleProgressSave(nextProgress, block.chapterIndex, block.blockIndex);
        return;
      }

      if (currentBook.format === 'pdf') {
        setPdfSeekRequest({ progress: nextProgress, nonce: Date.now() });
      }
    },
    [epubHtmlBook, scheduleProgressSave, textBlocks]
  );
  const turnReaderPage = useCallback((delta: -1 | 1) => {
    const currentBook = bookRef.current;
    if (!currentBook || settingsRef.current.mode !== 'tap') return;
    const resolvedDelta = settingsRef.current.swapTapZones ? ((delta * -1) as -1 | 1) : delta;
    if (currentBook.format === 'epub') {
      setEpubPagedTurnRequest({ delta: resolvedDelta, nonce: Date.now() });
      return;
    }
    if (currentBook.format === 'pdf') {
      setPdfTurnRequest({ delta: resolvedDelta, nonce: Date.now() });
      return;
    }
    setTextTurnRequest({ delta: resolvedDelta, nonce: Date.now() });
  }, []);

  useEffect(() => {
    if (!settings.volumeTurnPage || settings.mode !== 'tap') return undefined;
    const subscription = addVolumeKeyListener((direction) => {
      turnReaderPage(direction === 'up' ? 1 : -1);
    });
    return () => subscription.remove();
  }, [settings.mode, settings.volumeTurnPage, turnReaderPage]);

  const closeReader = useCallback(async () => {
    await flushProgressSave();
    await clearLastReaderBookId(bookRef.current?.id);
    if (entry === 'restore') {
      router.replace('/');
      return;
    }
    router.back();
  }, [entry, flushProgressSave]);
  const handlePagedEpubTap = useCallback(
    (x: number, pageWidth: number) => {
      if (settingsRef.current.showPageButtons) {
        toggleToolbar();
        return;
      }
      const action = tapZoneAction(x, pageWidth, settingsRef.current.swapTapZones);
      if (action === 'toolbar') {
        toggleToolbar();
        return;
      }
      setEpubPagedTurnRequest({ delta: action === 'next' ? 1 : -1, nonce: Date.now() });
    },
    [toggleToolbar]
  );

  if (!book) {
    return (
      <SafeAreaView style={[styles.screen, { backgroundColor }]}>
        <View style={styles.centeredLoader}>
          <ActivityIndicator color={foregroundColor} />
        </View>
      </SafeAreaView>
    );
  }

  const progressText = `${(displayProgress * 100).toFixed(1)}%`;
  const currentChapterTitle =
    book.format === 'txt' ? chapters[currentChapterIndex]?.title || book.title : epubChapterTitle || book.title;
  const sheetChapters = chaptersForSheet(book.format, epubToc, chapters);
  const showReaderPageButtons = book.format === 'epub' && settings.mode === 'tap' && settings.showPageButtons;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]}>
      <StatusBar hidden={!settings.alwaysShowStatusBar} style={readerIsDark ? 'light' : 'dark'} />
      <View style={[styles.readerTop, { backgroundColor }]}>
        <Text style={[styles.chapterTitle, { color: foregroundColor }]} numberOfLines={1}>
          {currentChapterTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('closeReader')}
          disabled={!toolbarOpen}
          pointerEvents={toolbarOpen ? 'auto' : 'none'}
          onPress={closeReader}
          style={[styles.readerCloseButton, !toolbarOpen && styles.readerCloseButtonHidden]}>
          <X size={22} color={foregroundColor} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={styles.readerBody}>
        {book.format === 'epub' && settings.mode === 'scroll' ? (
          epubHtmlBook ? (
            <EpubScrollPane
              key={`${book.id}:${epubReaderKey}`}
              book={epubHtmlBook}
              settings={settings}
              systemColorScheme={systemColorScheme}
              initialIndex={currentChapterIndex}
              initialOffset={book.currentOffset}
              initialProgress={book.progress}
              jumpRequest={epubJumpRequest}
              seekRequest={epubSeekRequest}
              onToggleToolbar={toggleToolbar}
              onImagePress={openImagePreview}
              onRecoverRequired={rebuildEpubReader}
              onProgress={(progress, chapterIndex, href, chapterOffset) => {
                const chapter = epubHtmlBook.chapters[chapterIndex];
                setCurrentChapterIndex(chapterIndex);
                setCurrentEpubHref(href);
                if (chapter?.title) {
                  setEpubChapterTitle((current) => (current === chapter.title ? current : chapter.title));
                }
                scheduleProgressSave(progress, chapterIndex, chapterOffset, createEpubScrollLocation(chapterIndex, chapterOffset, href));
              }}
            />
          ) : (
            <View style={styles.centeredLoader}>
              <ActivityIndicator color={foregroundColor} />
            </View>
          )
        ) : book.format === 'epub' ? (
          epubHtmlBook ? (
            <EpubPagedPane
              key={`${book.id}:${epubReaderKey}`}
              book={epubHtmlBook}
              settings={settings}
              systemColorScheme={systemColorScheme}
              initialIndex={currentChapterIndex}
              initialOffset={book.currentOffset}
              initialProgress={book.progress}
              jumpRequest={epubJumpRequest}
              seekRequest={epubPagedSeekRequest}
              turnRequest={epubPagedTurnRequest}
              onTap={handlePagedEpubTap}
              onImagePress={openImagePreview}
              onRecoverRequired={rebuildEpubReader}
              onProgress={(progress, chapterIndex, href, chapterOffset) => {
                const chapter = epubHtmlBook.chapters[chapterIndex];
                setCurrentChapterIndex(chapterIndex);
                setCurrentEpubHref(href);
                if (chapter?.title) {
                  setEpubChapterTitle((current) => (current === chapter.title ? current : chapter.title));
                }
                scheduleProgressSave(progress, chapterIndex, chapterOffset, createEpubScrollLocation(chapterIndex, chapterOffset, href));
              }}
            />
          ) : (
            <View style={styles.centeredLoader}>
              <ActivityIndicator color={foregroundColor} />
            </View>
          )
        ) : book.format === 'pdf' ? (
          <PdfPane
            key={book.id}
            book={book}
            colors={readerIsDark ? Colors.dark : Colors.light}
            seekRequest={pdfSeekRequest}
            turnRequest={pdfTurnRequest}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        ) : settings.mode === 'scroll' ? (
          <TextScrollPane
            blocks={visibleTextBlocks}
            totalBlocks={textBlocks.length}
            totalChapters={chapters.length}
            initialBlockIndex={Math.min(
              Math.max(0, Math.floor(book.currentOffset) - textWindowStart),
              Math.max(0, visibleTextBlocks.length - 1)
            )}
            scrollRequest={textScrollRequest}
            settings={settings}
            foregroundColor={foregroundColor}
            onLoadMore={() =>
              setRenderedBlockCount((count) => Math.min(Math.max(count, textWindowStart) + TEXT_BLOCK_INCREMENT, textBlocks.length))
            }
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        ) : (
          <TapTextPane
            book={book}
            chapters={chapters}
            settings={settings}
            turnRequest={textTurnRequest}
            foregroundColor={foregroundColor}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        )}
        {showReaderPageButtons ? (
          <PageTurnButtons
            foregroundColor={foregroundColor}
            onPrevious={() => setEpubPagedTurnRequest({ delta: settings.swapTapZones ? 1 : -1, nonce: Date.now() })}
            onNext={() => setEpubPagedTurnRequest({ delta: settings.swapTapZones ? -1 : 1, nonce: Date.now() })}
          />
        ) : null}
      </View>

      <View style={[styles.statusBar, { backgroundColor }]}>
        <View style={styles.statusLeft}>
          <Text style={[styles.statusText, { color: foregroundColor }]}>{time}</Text>
          <BatteryBadge value={battery} color={foregroundColor} />
        </View>
        <Text style={[styles.statusText, { color: foregroundColor }]}>{progressText}</Text>
      </View>

      {toolbarOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('closeToolbar')}
          onPress={closeToolbar}
          style={styles.toolbarBackdrop}
        />
      ) : null}

      {sheet ? (
        <ReaderSheet
          sheet={sheet}
          settings={settingsRef.current}
          systemColorScheme={systemColorScheme}
          colors={readerIsDark ? Colors.dark : Colors.light}
          progress={displayProgress}
          chapters={sheetChapters}
          hasChapters={sheetChapters.length > 0}
          currentChapterIndex={currentChapterIndex}
          currentChapterHref={book.format === 'epub' ? currentEpubHref : undefined}
          onSelectChapter={(index, href) => {
            setCurrentChapterIndex(index);
            if (book.format === 'epub' && href) {
              const estimatedProgress = epubToc.length > 1 ? index / epubToc.length : 0;
              const title = epubToc[index]?.title;
              setCurrentEpubHref(href);
              if (title) {
                setEpubChapterTitle(title);
              }
              scheduleProgressSave(estimatedProgress, index, 0, createEpubScrollLocation(index, 0, href));
              setEpubJumpRequest({ index, nonce: Date.now() });
            } else {
              const targetBlock = textBlocks.find((block) => block.chapterIndex === index);
              const nextOffset = targetBlock?.blockIndex ?? 0;
              setTextWindowStart(nextOffset);
              setRenderedBlockCount(Math.max(INITIAL_TEXT_BLOCKS, nextOffset + TEXT_BLOCK_INCREMENT * 3));
              setTextScrollRequest({ blockIndex: nextOffset, nonce: Date.now() });
              const nextProgress = textBlocks.length ? nextOffset / textBlocks.length : 0;
              scheduleProgressSave(nextProgress, index, nextOffset);
            }
            closeToolbar();
          }}
          onSettings={updateSettings}
          onStyleChange={guardProgressForStyleChange}
          onSeekProgress={seekToProgress}
          disabledSheets={book.format === 'pdf' ? ['theme', 'font'] : []}
          resolveChapterIndex={(href, fallbackIndex) => {
            if (book.format !== 'epub' || !epubHtmlBook) return fallbackIndex;
            const index = epubHtmlBook.chapters.findIndex((chapter) => isSameEpubHref(chapter.href, href));
            return index >= 0 ? index : fallbackIndex;
          }}
        />
      ) : null}

      {toolbarOpen ? (
        <View style={[styles.toolbar, { backgroundColor: toolbarSurface, borderTopColor: toolbarBorder }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('toc')}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('toc');
            }}
            style={[styles.toolbarIconButton, sheet === 'toc' && styles.toolbarIconButtonActive]}>
            <List size={28} strokeWidth={2.2} color={sheet === 'toc' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('background')}
            accessibilityState={{ disabled: book.format === 'pdf' }}
            disabled={book.format === 'pdf'}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('theme');
            }}
            style={[styles.toolbarIconButton, sheet === 'theme' && styles.toolbarIconButtonActive, book.format === 'pdf' && styles.toolbarIconButtonDisabled]}>
            <Sun size={28} strokeWidth={2.2} color={book.format === 'pdf' ? disabledToolColor(foregroundColor) : sheet === 'theme' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('progress')}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('progress');
            }}
            style={[styles.toolbarIconButton, sheet === 'progress' && styles.toolbarIconButtonActive]}>
            <ProgressToolIcon color={sheet === 'progress' ? ACTIVE_TOOL_COLOR : foregroundColor} backgroundColor={toolbarSurface} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('font')}
            accessibilityState={{ disabled: book.format === 'pdf' }}
            disabled={book.format === 'pdf'}
            onPress={() => {
              animateLayoutIfEnabled(settings.einkOptimization);
              setSheet('font');
            }}
            style={[styles.toolbarIconButton, sheet === 'font' && styles.toolbarIconButtonActive, book.format === 'pdf' && styles.toolbarIconButtonDisabled]}>
            <Type size={30} strokeWidth={2.1} color={book.format === 'pdf' ? disabledToolColor(foregroundColor) : sheet === 'font' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
        </View>
      ) : null}

      <ImagePreviewModal
        uri={previewImageUri}
        einkOptimization={settings.einkOptimization}
        onClose={() => setPreviewImageUri(null)}
      />
    </SafeAreaView>
  );
}

function TextScrollPane({
  blocks,
  totalBlocks,
  totalChapters,
  initialBlockIndex,
  scrollRequest,
  settings,
  foregroundColor,
  onLoadMore,
  onProgress,
  onToggleToolbar,
}: {
  blocks: TextBlock[];
  totalBlocks: number;
  totalChapters: number;
  initialBlockIndex: number;
  scrollRequest: TextScrollRequest | null;
  settings: ReadingSettings;
  foregroundColor: string;
  onLoadMore: () => void;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const { t } = useTranslation();
  const listRef = useRef<FlatList<TextBlock>>(null);
  const hasRestored = useRef(false);
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });
  const pendingScrollIndex = useRef<number | null>(null);
  const scrollRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRetryCount = useRef(0);

  const scrollToBlockTop = useCallback((blockIndex: number) => {
    pendingScrollIndex.current = blockIndex;
    listRef.current?.scrollToIndex({
      index: blockIndex,
      animated: false,
      viewPosition: 0,
      viewOffset: 0,
    });
  }, []);

  useEffect(() => {
    if (hasRestored.current || initialBlockIndex <= 0 || blocks.length <= initialBlockIndex) return;
    hasRestored.current = true;
    scrollRetryCount.current = 0;
    requestAnimationFrame(() => {
      scrollToBlockTop(initialBlockIndex);
    });
  }, [blocks.length, initialBlockIndex, scrollToBlockTop]);

  useEffect(() => {
    if (!scrollRequest) return;
    const localIndex = blocks.findIndex((block) => block.blockIndex === scrollRequest.blockIndex);
    if (localIndex < 0) return;
    scrollRetryCount.current = 0;
    requestAnimationFrame(() => {
      scrollToBlockTop(localIndex);
    });
  }, [blocks, scrollRequest, scrollToBlockTop]);

  useEffect(
    () => () => {
      if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
    },
    []
  );

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken<TextBlock>[] }) => {
      const current = viewableItems
        .filter((item) => item.isViewable && item.item)
        .sort((a, b) => (a.index ?? Number.MAX_SAFE_INTEGER) - (b.index ?? Number.MAX_SAFE_INTEGER))[0]?.item;
      if (!current) return;
      const progress = totalBlocks ? current.blockIndex / totalBlocks : 0;
      onProgress(progress, current.chapterIndex, current.blockIndex);
    },
    [onProgress, totalBlocks]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TextBlock>) => (
      <View style={styles.chapterBlock}>
        {item.title ? <Text style={[styles.textChapterTitle, { color: foregroundColor }]}>{item.title}</Text> : null}
        <Text
          style={[
            styles.readerText,
            {
              color: foregroundColor,
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightScale,
              fontFamily: fontFamilyFor(settings.fontFamily),
            },
          ]}>
          {item.text}
        </Text>
      </View>
    ),
    [foregroundColor, settings.fontFamily, settings.fontSize, settings.lineHeightScale]
  );

  return (
    <FlatList
      ref={listRef}
      data={blocks}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      showsVerticalScrollIndicator={!settings.hideScrollbar}
      initialNumToRender={8}
      maxToRenderPerBatch={6}
      updateCellsBatchingPeriod={80}
      windowSize={5}
      removeClippedSubviews
      onTouchStart={(event) => {
        isDragging.current = false;
        touchStart.current = {
          x: event.nativeEvent.pageX,
          y: event.nativeEvent.pageY,
        };
      }}
      onTouchEnd={(event) => {
        const dx = Math.abs(event.nativeEvent.pageX - touchStart.current.x);
        const dy = Math.abs(event.nativeEvent.pageY - touchStart.current.y);
        if (!isDragging.current && dx < 8 && dy < 8) {
          onToggleToolbar();
        }
      }}
      onScrollBeginDrag={() => {
        isDragging.current = true;
      }}
      onScrollEndDrag={() => {
        setTimeout(() => {
          isDragging.current = false;
        }, 120);
      }}
      onMomentumScrollBegin={() => {
        isDragging.current = true;
      }}
      onMomentumScrollEnd={() => {
        setTimeout(() => {
          isDragging.current = false;
        }, 120);
      }}
      onEndReachedThreshold={0.75}
      onEndReached={onLoadMore}
      onScrollToIndexFailed={({ index, averageItemLength }) => {
        pendingScrollIndex.current = index;
        if (scrollRetryCount.current >= 8) return;
        scrollRetryCount.current += 1;
        if (scrollRetryTimer.current) clearTimeout(scrollRetryTimer.current);
        listRef.current?.scrollToOffset({
          offset: Math.max(0, index * averageItemLength),
          animated: false,
        });
        scrollRetryTimer.current = setTimeout(() => {
          const targetIndex = pendingScrollIndex.current;
          if (targetIndex === null || blocks.length <= targetIndex) return;
          scrollToBlockTop(targetIndex);
        }, 120);
      }}
      viewabilityConfig={{ itemVisiblePercentThreshold: 35, minimumViewTime: 220 }}
      onViewableItemsChanged={onViewableItemsChanged}
      ListFooterComponent={
        blocks.length < totalBlocks ? (
          <View style={styles.lazyFooter}>
            <ActivityIndicator color={foregroundColor} />
            <Text style={[styles.lazyFooterText, { color: foregroundColor }]}>{t('loadMoreChapters')}</Text>
          </View>
        ) : null
      }
      contentContainerStyle={[
        styles.textContent,
        {
          paddingHorizontal: 18 + settings.paddingScale * 18,
        },
      ]}
      accessibilityLabel={t('bodyChaptersA11y', { count: totalChapters })}
    />
  );
}

function buildTextBlocks(chapters: ReaderChapter[]): TextBlock[] {
  let blockIndex = 0;

  return chapters.flatMap((chapter, chapterIndex) => {
    const pieces = splitTextForVirtualList(chapter.text);
    return pieces.map((text, pieceIndex) => ({
      id: `${chapter.id}-${pieceIndex}`,
      chapterIndex,
      blockIndex: blockIndex++,
      title: pieceIndex === 0 ? chapter.title : undefined,
      text,
    }));
  });
}

function splitTextForVirtualList(text: string) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const source = paragraphs.length ? paragraphs : [text];
  const blocks: string[] = [];

  for (const paragraph of source) {
    if (paragraph.length <= 1800) {
      blocks.push(paragraph);
      continue;
    }
    for (let index = 0; index < paragraph.length; index += 1600) {
      blocks.push(paragraph.slice(index, index + 1600));
    }
  }

  return blocks.length ? blocks : [''];
}

function disabledToolColor(color: string) {
  return color.startsWith('#') ? `${color}66` : 'rgba(120,120,120,0.45)';
}

function chaptersForSheet(format: Book['format'], epubToc: ReaderChapter[], chapters: ReaderChapter[]) {
  if (format === 'epub') {
    return epubToc.filter((chapter) => chapter.title.trim().length > 0);
  }

  if (format === 'txt') {
    return chapters.filter((chapter) => chapter.title.trim().length > 0 || chapter.text.trim().length > 0);
  }

  return [];
}

function batteryPercentFromLevel(level: number) {
  if (!Number.isFinite(level) || level < 0) return null;
  return Math.round(clamp(level, 0, 1) * 100);
}

async function readBatteryPercent() {
  try {
    const powerState = await Battery.getPowerStateAsync();
    const powerStatePercent = batteryPercentFromLevel(powerState.batteryLevel);
    if (powerStatePercent !== null) return powerStatePercent;
  } catch {
    // Fall through to the narrower API below.
  }

  try {
    return batteryPercentFromLevel(await Battery.getBatteryLevelAsync());
  } catch {
    return null;
  }
}

function tapZoneAction(x: number, width: number, swapTapZones: boolean): TapZoneAction {
  if (!Number.isFinite(x) || !Number.isFinite(width) || width <= 0) {
    return 'toolbar';
  }
  const ratio = x / width;
  if (ratio < TAP_ZONE_EDGE_RATIO) {
    return swapTapZones ? 'next' : 'previous';
  }
  if (ratio > 1 - TAP_ZONE_EDGE_RATIO) {
    return swapTapZones ? 'previous' : 'next';
  }
  return 'toolbar';
}

function normalizeEpubHref(href?: string | null) {
  if (!href) return '';
  return href.split('#')[0].replace(/^.*\/([^/]+)$/, '$1');
}

function createEpubScrollLocation(index: number, offset: number, href: string) {
  return `point-reader:epub-scroll:${Math.max(0, Math.round(index))}:${clamp(offset, 0, 1).toFixed(6)}:${encodeURIComponent(href)}`;
}

function parseEpubScrollLocation(location?: string | null) {
  if (!location?.startsWith('point-reader:epub-scroll:')) return null;
  const match = location.match(/^point-reader:epub-scroll:(\d+):([0-9.]+):(.*)$/);
  if (!match) return null;
  return {
    index: Number(match[1]),
    offset: clamp(Number(match[2]), 0, 1),
    href: decodeURIComponent(match[3] ?? ''),
  };
}

function progressToEpubPosition(progress: number, chapterCount: number) {
  if (chapterCount <= 0) return { index: 0, offset: 0 };
  const absolute = clamp(progress, 0, 1) * chapterCount;
  const index = Math.min(chapterCount - 1, Math.max(0, Math.floor(absolute)));
  const offset = index === chapterCount - 1 && progress >= 0.999 ? 1 : clamp(absolute - index, 0, 1);
  return { index, offset };
}

function epubPositionProgress(index: number, offset: number, chapterCount: number) {
  if (chapterCount <= 0) return 0;
  return clamp((index + clamp(offset, 0, 1)) / chapterCount, 0, 1);
}

function resolveEpubRestorePosition(book: Book, epubBook: EpubHtmlBook) {
  const chapterCount = epubBook.chapters.length;
  if (chapterCount <= 0) return { index: 0, offset: 0 };

  const progressPosition = progressToEpubPosition(book.progress, chapterCount);
  const restoredEpubPosition = parseEpubScrollLocation(book.currentLocation);
  const restoredHrefIndex = epubBook.chapters.findIndex((chapter) =>
    isSameEpubHref(chapter.href, restoredEpubPosition?.href ?? book.currentLocation)
  );
  const locationIndex =
    restoredEpubPosition && restoredEpubPosition.index >= 0 && restoredEpubPosition.index < chapterCount
      ? restoredEpubPosition.index
      : restoredHrefIndex >= 0
        ? restoredHrefIndex
        : Math.round(clamp(book.currentChapter, 0, Math.max(0, chapterCount - 1)));
  const locationOffset =
    restoredEpubPosition?.offset && restoredEpubPosition.offset > 0
      ? restoredEpubPosition.offset
      : book.currentOffset > 0 && book.currentOffset <= 1
        ? book.currentOffset
        : 0;
  const locationProgress = epubPositionProgress(locationIndex, locationOffset, chapterCount);
  const hasMeaningfulProgress = book.progress > 0.015;
  const locationIsBehindProgress = locationProgress + 0.035 < book.progress;
  const locationLooksLikeCover = locationIndex === 0 && locationOffset <= 0.01 && book.progress > 0.025;

  if (hasMeaningfulProgress && (locationIsBehindProgress || locationLooksLikeCover)) {
    return progressPosition;
  }

  return { index: locationIndex, offset: locationOffset };
}

function isSameEpubHref(first?: string | null, second?: string | null) {
  const parsedSecond = parseEpubScrollLocation(second);
  const normalizedFirst = normalizeEpubHref(first);
  const normalizedSecond = normalizeEpubHref(parsedSecond?.href ?? second);
  return Boolean(normalizedFirst && normalizedSecond && normalizedFirst === normalizedSecond);
}

function TapTextPane({
  book,
  chapters,
  settings,
  turnRequest,
  foregroundColor,
  onProgress,
  onToggleToolbar,
}: {
  book: Book;
  chapters: ReaderChapter[];
  settings: ReadingSettings;
  turnRequest: { delta: -1 | 1; nonce: number } | null;
  foregroundColor: string;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const [index, setIndex] = useState(book.currentChapter);
  const chapter = chapters[index] ?? chapters[0];
  const { width } = useWindowDimensions();
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  const move = useCallback((delta: number) => {
    const next = Math.max(0, Math.min(chapters.length - 1, index + delta));
    setIndex(next);
    onProgress(chapters.length ? next / chapters.length : 0, next, 0);
  }, [chapters.length, index, onProgress]);

  useEffect(() => {
    if (!turnRequest) return;
    move(turnRequest.delta);
  }, [move, turnRequest]);

  return (
    <View style={styles.tapPane}>
      <ScrollView
        contentContainerStyle={[styles.textContent, { paddingHorizontal: 18 + settings.paddingScale * 18 }]}
        onTouchStart={(event) => {
          isDragging.current = false;
          touchStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
        }}
        onTouchEnd={(event) => {
          const dx = Math.abs(event.nativeEvent.pageX - touchStart.current.x);
          const dy = Math.abs(event.nativeEvent.pageY - touchStart.current.y);
          if (!isDragging.current && dx < 8 && dy < 8) {
            const action = tapZoneAction(event.nativeEvent.pageX, width, settings.swapTapZones);
            if (settings.showPageButtons) {
              onToggleToolbar();
            } else if (action === 'previous') {
              move(-1);
            } else if (action === 'next') {
              move(1);
            } else {
              onToggleToolbar();
            }
          }
        }}
        onScrollBeginDrag={() => {
          isDragging.current = true;
        }}
        onScrollEndDrag={() => {
          setTimeout(() => {
            isDragging.current = false;
          }, 120);
        }}
        onMomentumScrollBegin={() => {
          isDragging.current = true;
        }}
        onMomentumScrollEnd={() => {
          setTimeout(() => {
            isDragging.current = false;
          }, 120);
        }}>
        <Text style={[styles.textChapterTitle, { color: foregroundColor }]}>{chapter?.title}</Text>
        <Text
          style={[
            styles.readerText,
            {
              color: foregroundColor,
              fontSize: settings.fontSize,
              lineHeight: settings.fontSize * settings.lineHeightScale,
              fontFamily: fontFamilyFor(settings.fontFamily),
            },
          ]}>
          {chapter?.text}
        </Text>
      </ScrollView>
      {settings.showPageButtons ? (
        <PageTurnButtons
          foregroundColor={foregroundColor}
          onPrevious={() => move(settings.swapTapZones ? 1 : -1)}
          onNext={() => move(settings.swapTapZones ? -1 : 1)}
        />
      ) : null}
    </View>
  );
}

function PageTurnButtons({
  foregroundColor,
  onPrevious,
  onNext,
}: {
  foregroundColor: string;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View pointerEvents="box-none" style={styles.pageButtons}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('previousPage')}
        onPress={onPrevious}
        style={styles.pageButton}>
        <ChevronLeft size={28} color={foregroundColor} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('nextPage')}
        onPress={onNext}
        style={styles.pageButton}>
        <ChevronRight size={28} color={foregroundColor} />
      </Pressable>
    </View>
  );
}

function BatteryBadge({ value, color }: { value: number | null; color: string }) {
  const { t } = useTranslation();
  const batteryText = value === null ? '--' : String(Math.round(clamp(value, 0, 100)));

  return (
    <View style={styles.batteryBadge} accessibilityLabel={value === null ? t('batteryUnknown') : t('batteryValue', { value })}>
      <View style={[styles.batteryBody, { borderColor: color }]}>
        <Text style={[styles.batteryBadgeText, { color }]}>{batteryText}</Text>
      </View>
      <View style={[styles.batteryCap, { borderColor: color }]} />
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  readerTop: {
    position: 'relative',
    minHeight: 46,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  chapterTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    color: 'rgba(28,25,23,0.62)',
  },
  readerCloseButton: {
    width: TouchTarget,
    height: TouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing.two,
  },
  readerCloseButtonHidden: {
    opacity: 0,
  },
  readerBody: {
    flex: 1,
    position: 'relative',
  },
  webViewReaderHost: {
    flex: 1,
  },
  webViewReader: {
    flex: 1,
  },
  webViewReaderHidden: {
    opacity: 0,
  },
  epubRestoreOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centeredLoader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContent: {
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  chapterBlock: {
    gap: Spacing.three,
  },
  textChapterTitle: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: '900',
    color: readerForeground,
  },
  readerText: {
    color: readerForeground,
  },
  chapterDivider: {
    height: 1,
    backgroundColor: 'rgba(28,25,23,0.18)',
    marginVertical: Spacing.three,
  },
  lazyFooter: {
    minHeight: 84,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  lazyFooterText: {
    fontSize: 13,
    fontWeight: '800',
    color: readerForeground,
  },
  statusBar: {
    minHeight: 28,
    paddingHorizontal: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  statusText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: '400',
    color: 'rgba(28,25,23,0.62)',
  },
  batteryBadge: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  batteryBody: {
    position: 'relative',
    width: BATTERY_BODY_WIDTH,
    height: BATTERY_BODY_HEIGHT,
    borderWidth: 1.5,
    borderColor: 'rgba(28,25,23,0.62)',
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  batteryBadgeText: {
    textAlign: 'center',
    textAlignVertical: 'center',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '700',
    includeFontPadding: false,
    color: 'rgba(28,25,23,0.7)',
  },
  batteryCap: {
    width: 2.5,
    height: 6,
    borderTopWidth: 1.5,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(28,25,23,0.62)',
  },
  toolbarBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: READER_TOOLBAR_HEIGHT,
    zIndex: 8,
    backgroundColor: 'transparent',
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: READER_TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.one,
    borderTopWidth: 1,
    borderTopColor: 'rgba(28,25,23,0.16)',
    backgroundColor: Colors.light.surface,
    zIndex: 30,
  },
  toolbarIconButton: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarIconButtonActive: {
    backgroundColor: 'transparent',
  },
  toolbarIconButtonDisabled: {
    opacity: 0.42,
  },










  tocItemCurrent: {
    backgroundColor: Colors.light.backgroundElement,
  },














  tapPane: {
    flex: 1,
  },
  pageButtons: {
    position: 'absolute',
    left: Spacing.two,
    right: Spacing.two,
    top: '50%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    transform: [{ translateY: -24 }],
    zIndex: 6,
  },
  pageButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.4)',
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
