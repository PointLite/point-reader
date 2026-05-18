import { Reader, useReader, type Location, type Toc } from '@epubjs-react-native/core';
import * as Battery from 'expo-battery';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  List,
  ListChevronsUpDown,
  RotateCcw,
  RotateCw,
  SquareDashed,
  Sun,
  Type,
  X,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  FlatList,
  Image,
  Modal,
  PanResponder,
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
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { ReaderMetricControl } from '@/components/reader/metric-control';
import { PdfPane } from '@/components/reader/pdf-pane';
import { Colors, Radius, Spacing, TouchTarget } from '@/constants/theme';
import { getBook, updateBookProgress } from '@/lib/books';
import { loadEpubHtmlBook, type EpubHtmlBook } from '@/lib/epubContent';
import { useLegacyEpubFileSystem } from '@/lib/epubFileSystem';
import {
  fontFamilyFor,
  loadTextChapters,
  readerBackgroundFor,
  readerBackgrounds,
  readerForeground,
  readerForegroundFor,
} from '@/lib/readerContent';
import { defaultReadingSettings, loadReadingSettings, saveReadingSettings } from '@/lib/settings';
import type { AppColors } from '@/lib/theme';
import type { Book, ReaderChapter, ReadingSettings } from '@/types/reader';

const KEEP_AWAKE_TAG = 'point-reader:reader';
const INITIAL_TEXT_BLOCKS = 18;
const TEXT_BLOCK_INCREMENT = 12;
const MIN_PREVIEW_SCALE = 1;
const MAX_PREVIEW_SCALE = 4;
const STYLE_PROGRESS_GUARD_MS = 2500;
const PROGRESS_SAVE_DEBOUNCE_MS = 100;
const BATTERY_REFRESH_INTERVAL_MS = 30000;
const READER_TOOLBAR_HEIGHT = 68;
const ACTIVE_TOOL_COLOR = '#3478F6';
const BATTERY_BODY_WIDTH = 26;
const BATTERY_BODY_HEIGHT = 14;
const TAP_ZONE_EDGE_RATIO = 0.35;

type TapZoneAction = 'previous' | 'toolbar' | 'next';

const EPUB_IMAGE_PREVIEW_SCRIPT = `
setTimeout(function () {
(function () {
  if (window.__pointReaderImagePreviewInstalled) {
    return;
  }

  window.__pointReaderImagePreviewInstalled = true;
  var lastSentAt = 0;
  var lastProgressSentAt = 0;
  var lastUserScrollAt = 0;
  var jumpGeneration = 0;
  var progressTimer = null;
  var reactNativeWebview = window.ReactNativeWebView !== undefined && window.ReactNativeWebView !== null ? window.ReactNativeWebView : window;

  function sendImage(src) {
    if (!src) return;
    var now = Date.now();
    if (now - lastSentAt < 350) return;
    lastSentAt = now;
    reactNativeWebview.postMessage(JSON.stringify({
      type: 'point-reader:image-preview',
      src: src
    }));
  }

  function sendContentTap(x, width) {
    reactNativeWebview.postMessage(JSON.stringify({
      type: 'point-reader:content-tap',
      x: typeof x === 'number' ? x : null,
      width: typeof width === 'number' ? width : null
    }));
  }

  function sendReaderError(message) {
    reactNativeWebview.postMessage(JSON.stringify({
      type: 'point-reader:reader-error',
      message: String(message || 'unknown')
    }));
  }

  function sendReadingProgress() {
    try {
      if (typeof rendition === 'undefined' || typeof book === 'undefined' || !rendition || !book) return;
      var location = rendition.currentLocation && rendition.currentLocation();
      var cfi = location && location.start && location.start.cfi;
      if (!location || !cfi || !book.locations || !book.locations.percentageFromCfi) return;
      var progress = book.locations.percentageFromCfi(cfi);
      reactNativeWebview.postMessage(JSON.stringify({
        type: 'point-reader:reading-progress',
        progress: progress,
        location: location
      }));
    } catch (error) {}
  }

  function scheduleReadingProgress() {
    if (Date.now() < (window.__pointReaderSuppressProgressUntil || 0)) return;
    var now = Date.now();
    if (now - lastProgressSentAt > 120) {
      lastProgressSentAt = now;
      sendReadingProgress();
      return;
    }
    if (progressTimer) return;
    progressTimer = setTimeout(function () {
      progressTimer = null;
      lastProgressSentAt = Date.now();
      sendReadingProgress();
    }, 120);
  }

  function noteUserScrollIntent() {
    lastUserScrollAt = Date.now();
    window.__pointReaderLastUserScrollAt = lastUserScrollAt;
  }

  window.__pointReaderScheduleReadingProgress = scheduleReadingProgress;
  window.__pointReaderSendReaderError = sendReaderError;

  function findImageTarget(target) {
    var current = target;
    while (current && current.nodeType === 1) {
      var tagName = String(current.tagName || '').toLowerCase();
      if (tagName === 'img' || tagName === 'image') return current;
      current = current.parentElement;
    }
    return null;
  }

  function getImageSrc(documentRef, image) {
    var rawSrc = image.currentSrc || image.src || image.getAttribute('src') || image.getAttribute('xlink:href') || image.getAttribute('href');
    if (!rawSrc) return '';
    try {
      return new URL(rawSrc, documentRef.location.href).toString();
    } catch (error) {
      return rawSrc;
    }
  }

  function toDataUrl(src) {
    return fetch(src)
      .then(function (response) { return response.blob(); })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result || src); };
          reader.onerror = function () { resolve(src); };
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () { return src; });
  }

  function openPreview(documentRef, image, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    var src = getImageSrc(documentRef, image);
    toDataUrl(src).then(sendImage);
  }

  function bindImages(contents) {
    var documentRef = contents && (contents.document || (contents.content && contents.content.document));
    if (!documentRef) return;
    var images = documentRef.querySelectorAll('img, image');
    for (var index = 0; index < images.length; index += 1) {
      var image = images[index];
      if (image.getAttribute('data-point-reader-preview') === '1') continue;
      image.setAttribute('data-point-reader-preview', '1');
      image.style.cursor = 'pointer';
      image.addEventListener('click', function (event) {
        if (event.currentTarget.__pointReaderSuppressClickUntil && Date.now() < event.currentTarget.__pointReaderSuppressClickUntil) {
          return;
        }
        openPreview(documentRef, event.currentTarget, event);
      }, true);
      image.addEventListener('touchstart', function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        event.currentTarget.__pointReaderTouchMoved = false;
        event.currentTarget.__pointReaderTouchStartX = event.touches[0].clientX;
        event.currentTarget.__pointReaderTouchStartY = event.touches[0].clientY;
      }, true);
      image.addEventListener('touchmove', function (event) {
        if (!event.touches || event.touches.length !== 1) return;
        var startX = event.currentTarget.__pointReaderTouchStartX || 0;
        var startY = event.currentTarget.__pointReaderTouchStartY || 0;
        var dx = Math.abs(event.touches[0].clientX - startX);
        var dy = Math.abs(event.touches[0].clientY - startY);
        if (dx > 8 || dy > 8) {
          event.currentTarget.__pointReaderTouchMoved = true;
        }
      }, true);
      image.addEventListener('touchend', function (event) {
        if (event.currentTarget.__pointReaderTouchMoved) {
          event.currentTarget.__pointReaderSuppressClickUntil = Date.now() + 450;
          event.currentTarget.__pointReaderTouchMoved = false;
          return;
        }
        if (event.changedTouches && event.changedTouches.length === 1) {
          openPreview(documentRef, event.currentTarget, event);
        }
      }, true);
    }
  }

  function bindDocumentTap(contents) {
    var documentRef = contents && (contents.document || (contents.content && contents.content.document));
    if (!documentRef || documentRef.__pointReaderTapBound) return;
    documentRef.__pointReaderTapBound = true;
    var startX = 0;
    var startY = 0;
    var moved = false;
    var lastTouchTapAt = 0;

    function viewportWidth() {
      var viewRef = documentRef.defaultView || window;
      return viewRef.innerWidth || documentRef.documentElement.clientWidth || documentRef.body.clientWidth || 0;
    }

    documentRef.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      moved = false;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
    }, true);

    documentRef.addEventListener('touchmove', function (event) {
      if (!event.touches || event.touches.length !== 1) return;
      var dx = Math.abs(event.touches[0].clientX - startX);
      var dy = Math.abs(event.touches[0].clientY - startY);
      if (dx > 8 || dy > 8) moved = true;
    }, true);

    documentRef.addEventListener('touchend', function (event) {
      if (moved || findImageTarget(event.target)) return;
      if (!event.changedTouches || event.changedTouches.length !== 1) return;
      lastTouchTapAt = Date.now();
      sendContentTap(event.changedTouches[0].clientX, viewportWidth());
    }, true);

    documentRef.addEventListener('click', function (event) {
      if (Date.now() - lastTouchTapAt < 450) return;
      if (findImageTarget(event.target)) return;
      sendContentTap(event.clientX, viewportWidth());
    }, true);
  }

  function bindDocumentProgress(contents) {
    var documentRef = contents && (contents.document || (contents.content && contents.content.document));
    if (!documentRef || documentRef.__pointReaderProgressBound) return;
    documentRef.__pointReaderProgressBound = true;
    var viewRef = documentRef.defaultView || window;
    documentRef.addEventListener('scroll', scheduleReadingProgress, true);
    documentRef.addEventListener('touchmove', function () {
      noteUserScrollIntent();
      scheduleReadingProgress();
    }, true);
    documentRef.addEventListener('touchend', function () {
      noteUserScrollIntent();
      scheduleReadingProgress();
    }, true);
    if (viewRef && viewRef.addEventListener) {
      viewRef.addEventListener('scroll', scheduleReadingProgress, true);
    }
  }

  function bindRenderedContents() {
    try {
      var rendered = rendition.getContents();
      for (var index = 0; index < rendered.length; index += 1) {
        bindImages(rendered[index]);
        bindDocumentTap(rendered[index]);
        bindDocumentProgress(rendered[index]);
      }
    } catch (error) {}
  }

  if (typeof rendition !== 'undefined') {
    rendition.hooks.content.register(function (contents) {
      setTimeout(function () {
        bindImages(contents);
        bindDocumentTap(contents);
        bindDocumentProgress(contents);
      }, 0);
    });
    rendition.on('rendered', bindRenderedContents);
    rendition.on('relocated', scheduleReadingProgress);
    setTimeout(bindRenderedContents, 500);
    setTimeout(scheduleReadingProgress, 900);
  }

  true;
})();
}, 0);
true;
`;

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

type EpubSeekRequest = {
  progress: number;
  nonce: number;
};

type PdfSeekRequest = {
  progress: number;
  nonce: number;
};

function createReaderTheme(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const padding = Math.round(18 + settings.paddingScale * 18);
  const lineHeight = settings.lineHeightScale.toFixed(2);
  const fontSize = `${settings.fontSize}px`;
  const fontFamily = settings.fontFamily === 'serif' ? 'serif' : settings.fontFamily === 'mono' ? 'monospace' : 'sans-serif';
  const background = readerBackgroundFor(settings, systemColorScheme);
  const foreground = readerForegroundFor(settings, systemColorScheme);

  return {
    html: {
      background,
    },
    body: {
      color: foreground,
      background,
      'font-size': fontSize,
      'line-height': `${lineHeight} !important`,
      'padding-left': `${padding}px !important`,
      'padding-right': `${padding}px !important`,
      margin: '0 !important',
      'box-sizing': 'border-box',
      'font-family': fontFamily,
    },
    'p, div, span, li': {
      'font-size': `${fontSize} !important`,
      'line-height': `${lineHeight} !important`,
      'font-family': `${fontFamily} !important`,
    },
  };
}

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();
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
  const [epubToc, setEpubToc] = useState<Toc>([]);
  const [epubHtmlBook, setEpubHtmlBook] = useState<EpubHtmlBook | null>(null);
  const [epubJumpRequest, setEpubJumpRequest] = useState<{ index: number; nonce: number } | null>(null);
  const [epubSeekRequest, setEpubSeekRequest] = useState<EpubSeekRequest | null>(null);
  const [pdfSeekRequest, setPdfSeekRequest] = useState<PdfSeekRequest | null>(null);
  const [epubLocation, setEpubLocation] = useState<string | undefined>(undefined);
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
        setDisplayProgress(nextBook?.progress ?? 0);
        setCurrentChapterIndex(nextBook?.currentChapter ?? 0);
        restoreProgressGuard.current =
          nextBook && nextBook.progress > 0.005
            ? { bookId: nextBook.id, progress: nextBook.progress, until: Date.now() + 6000 }
            : null;
        setEpubLocation(nextBook?.format === 'epub' ? nextBook.currentLocation ?? undefined : undefined);
        setCurrentEpubHref(undefined);
        setEpubReaderKey((key) => key + 1);
        setEpubChapterTitle('');
        setEpubHtmlBook(null);
        setEpubSeekRequest(null);
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
              .map((chapter) => ({ id: chapter.id, href: chapter.href, label: chapter.title.trim(), subitems: [] }))
              .filter((chapter) => chapter.label.length > 0)
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
      }
      load();
      return () => {
        mounted = false;
      };
    }, [bookId])
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
  }, []);

  const backgroundColor = readerBackgroundFor(settings, systemColorScheme);
  const foregroundColor = readerForegroundFor(settings, systemColorScheme);
  const readerIsDark = settings.colorScheme === 'dark' || (settings.colorScheme === 'system' && systemColorScheme === 'dark');
  const toolbarSurface = readerIsDark ? Colors.dark.surface : Colors.light.surface;
  const toolbarBorder = readerIsDark ? 'rgba(245,245,244,0.16)' : 'rgba(28,25,23,0.16)';

  const updateSettings = async (patch: Partial<ReadingSettings>) => {
    const next = { ...settings, ...patch };
    settingsRef.current = next;
    setSettings(next);
    await saveReadingSettings(next);
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
    await updateBookProgress(currentBook.id, pending.progress, pending.chapter, pending.offset, pending.location);
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
  }, []);

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
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        void flushProgressSave();
      }
    });
    return () => subscription.remove();
  }, [flushProgressSave]);

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
    setSheet(null);
    setToolbarOpen(false);
  }, []);
  const toggleToolbar = useCallback(() => {
    const now = Date.now();
    if (now - lastToolbarToggleAt.current < 260) return;
    lastToolbarToggleAt.current = now;
    setToolbarOpen((value) => {
      if (value) setSheet(null);
      return !value;
    });
  }, []);
  const openImagePreview = useCallback((uri: string) => {
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
        setEpubSeekRequest({ progress: nextProgress, nonce: Date.now() });
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
  const closeReader = useCallback(async () => {
    await flushProgressSave();
    router.back();
  }, [flushProgressSave]);
  const handleEpubProgress = useCallback(
    (nextProgress: number, location?: Location | null, chapterTitle?: string) => {
      const normalizedProgress = clamp(nextProgress, 0, 1);
      const cfi = location?.start?.cfi ?? null;
      const href = location?.start?.href;
      const sectionIndex = location?.start?.index ?? 0;
      const locationValue = location?.start?.location ?? normalizedProgress;
      scheduleProgressSave(normalizedProgress, sectionIndex, locationValue, cfi);
      if (href) {
        setCurrentEpubHref(href);
      }
      if (chapterTitle) {
        setEpubChapterTitle((current) => (current === chapterTitle ? current : chapterTitle));
      }
    },
    [scheduleProgressSave]
  );
  const handleEpubDisplayError = useCallback(() => {
    if (!epubLocation) return;
    setEpubLocation(undefined);
    setEpubReaderKey((key) => key + 1);
  }, [epubLocation]);

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor }]}>
      <StatusBar hidden={!settings.alwaysShowStatusBar} style={readerIsDark ? 'light' : 'dark'} />
      <View style={[styles.readerTop, { backgroundColor }]}>
        <Text style={[styles.chapterTitle, { color: foregroundColor }]} numberOfLines={1}>
          {currentChapterTitle}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="关闭阅读"
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
          <EpubPane
            book={book}
            settings={settings}
            systemColorScheme={systemColorScheme}
            onToc={setEpubToc}
            location={epubLocation}
            readerKey={epubReaderKey}
            onToggleToolbar={toggleToolbar}
            onProgress={handleEpubProgress}
            onChapterChange={(title, href) => {
              setEpubChapterTitle((current) => (current === title ? current : title));
              if (href) {
                setCurrentEpubHref(href);
              }
            }}
            onImagePress={openImagePreview}
            onDisplayError={handleEpubDisplayError}
          />
        ) : book.format === 'pdf' ? (
          <PdfPane
            key={book.id}
            book={book}
            colors={readerIsDark ? Colors.dark : Colors.light}
            seekRequest={pdfSeekRequest}
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
            foregroundColor={foregroundColor}
            onProgress={scheduleProgressSave}
            onToggleToolbar={toggleToolbar}
          />
        )}
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
          accessibilityLabel="关闭工具栏"
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
              const title = epubToc[index]?.label;
              setCurrentEpubHref(href);
              if (title) {
                setEpubChapterTitle(title);
              }
              scheduleProgressSave(estimatedProgress, index, 0, createEpubScrollLocation(index, 0, href));
              if (settings.mode === 'scroll') {
                setEpubJumpRequest({ index, nonce: Date.now() });
              }
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
            accessibilityLabel="目录"
            onPress={() => setSheet('toc')}
            style={[styles.toolbarIconButton, sheet === 'toc' && styles.toolbarIconButtonActive]}>
            <List size={28} strokeWidth={2.2} color={sheet === 'toc' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="背景"
            accessibilityState={{ disabled: book.format === 'pdf' }}
            disabled={book.format === 'pdf'}
            onPress={() => setSheet('theme')}
            style={[styles.toolbarIconButton, sheet === 'theme' && styles.toolbarIconButtonActive, book.format === 'pdf' && styles.toolbarIconButtonDisabled]}>
            <Sun size={28} strokeWidth={2.2} color={book.format === 'pdf' ? disabledToolColor(foregroundColor) : sheet === 'theme' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="进度"
            onPress={() => setSheet('progress')}
            style={[styles.toolbarIconButton, sheet === 'progress' && styles.toolbarIconButtonActive]}>
            <ProgressToolIcon color={sheet === 'progress' ? ACTIVE_TOOL_COLOR : foregroundColor} backgroundColor={toolbarSurface} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="字体"
            accessibilityState={{ disabled: book.format === 'pdf' }}
            disabled={book.format === 'pdf'}
            onPress={() => setSheet('font')}
            style={[styles.toolbarIconButton, sheet === 'font' && styles.toolbarIconButtonActive, book.format === 'pdf' && styles.toolbarIconButtonDisabled]}>
            <Type size={30} strokeWidth={2.1} color={book.format === 'pdf' ? disabledToolColor(foregroundColor) : sheet === 'font' ? ACTIVE_TOOL_COLOR : foregroundColor} />
          </Pressable>
        </View>
      ) : null}

      <ImagePreviewModal uri={previewImageUri} onClose={() => setPreviewImageUri(null)} />
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
            <Text style={[styles.lazyFooterText, { color: foregroundColor }]}>继续载入后续章节</Text>
          </View>
        ) : null
      }
      contentContainerStyle={[
        styles.textContent,
        {
          paddingHorizontal: 18 + settings.paddingScale * 18,
        },
      ]}
      accessibilityLabel={`正文，共 ${totalChapters} 个章节`}
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

function EpubScrollPane({
  book,
  settings,
  systemColorScheme,
  initialIndex,
  initialOffset,
  initialProgress,
  jumpRequest,
  seekRequest,
  onProgress,
  onToggleToolbar,
  onImagePress,
}: {
  book: EpubHtmlBook;
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  initialIndex: number;
  initialOffset: number;
  initialProgress: number;
  jumpRequest: { index: number; nonce: number } | null;
  seekRequest: EpubSeekRequest | null;
  onProgress: (progress: number, chapterIndex: number, href: string, chapterOffset: number) => void;
  onToggleToolbar: () => void;
  onImagePress: (uri: string) => void;
}) {
  const webViewRef = useRef<WebView>(null);
  const initialIndexRef = useRef(initialIndex);
  const initialOffsetRef = useRef(initialOffset > 0 && initialOffset <= 1 ? initialOffset : 0);
  const initialProgressRef = useRef(initialProgress);
  const initialSettingsRef = useRef(settings);
  const html = useMemo(
    () =>
      createEpubScrollHtml(
        book,
        initialSettingsRef.current,
        systemColorScheme,
        initialIndexRef.current,
        initialOffsetRef.current,
        initialProgressRef.current
      ),
    [book, systemColorScheme]
  );
  const source = useMemo(() => ({ html }), [html]);

  useEffect(() => {
    if (!jumpRequest) return;
    webViewRef.current?.injectJavaScript(`
      setTimeout(function () {
        if (window.PointReader && window.PointReader.jumpTo) {
          window.PointReader.jumpTo(${jumpRequest.index});
        }
      }, 0);
      true;
    `);
  }, [jumpRequest]);

  useEffect(() => {
    if (!seekRequest) return;
    const chapterCount = Math.max(1, book.chapters.length);
    const absolute = clamp(seekRequest.progress, 0, 1) * chapterCount;
    const index = Math.min(chapterCount - 1, Math.max(0, Math.floor(absolute)));
    const offset = index === chapterCount - 1 && seekRequest.progress >= 0.999 ? 1 : clamp(absolute - index, 0, 1);
    webViewRef.current?.injectJavaScript(`
      setTimeout(function () {
        if (window.PointReader && window.PointReader.jumpToOffset) {
          window.PointReader.jumpToOffset(${index}, ${offset});
        }
      }, 0);
      true;
    `);
  }, [book.chapters.length, seekRequest]);

  useEffect(() => {
    webViewRef.current?.injectJavaScript(createEpubSettingsScript(settings, systemColorScheme));
  }, [settings, systemColorScheme]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const payload = JSON.parse(event.nativeEvent.data);
        if (payload.type === 'tap') {
          onToggleToolbar();
        }
        if (payload.type === 'image' && typeof payload.src === 'string') {
          onImagePress(payload.src);
        }
        if (payload.type === 'progress') {
          onProgress(
            clamp(Number(payload.progress), 0, 1),
            Number(payload.index) || 0,
            String(payload.href || ''),
            clamp(Number(payload.offset), 0, 1)
          );
        }
      } catch {
        // Ignore malformed WebView messages.
      }
    },
    [onImagePress, onProgress, onToggleToolbar]
  );

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={source}
      javaScriptEnabled
      scrollEnabled
      showsVerticalScrollIndicator={!settings.hideScrollbar}
      onMessage={handleMessage}
      style={{ backgroundColor: readerBackgroundFor(settings, systemColorScheme) }}
    />
  );
}

function createEpubCssVars(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const padding = Math.round(18 + settings.paddingScale * 18);
  const background = readerBackgroundFor(settings, systemColorScheme);
  const foreground = readerForegroundFor(settings, systemColorScheme);
  const fontFamily = settings.fontFamily === 'serif' ? 'serif' : settings.fontFamily === 'mono' ? 'monospace' : 'sans-serif';

  return {
    background,
    foreground,
    fontFamily,
    fontSize: `${settings.fontSize}px`,
    lineHeight: String(settings.lineHeightScale),
    padding: `${padding}px`,
  };
}

function createEpubSettingsScript(settings: ReadingSettings, systemColorScheme?: 'light' | 'dark' | null) {
  const vars = createEpubCssVars(settings, systemColorScheme);
  return `
    setTimeout(function () {
      if (!window.PointReader || !window.PointReader.applySettings) return;
      window.PointReader.applySettings(${JSON.stringify(vars)});
    }, 0);
    true;
  `;
}

function createEpubScrollHtml(
  book: EpubHtmlBook,
  settings: ReadingSettings,
  systemColorScheme: 'light' | 'dark' | null | undefined,
  initialIndex: number,
  initialOffset: number,
  initialProgress: number
) {
  const safeInitialIndex = Math.max(0, Math.min(initialIndex, Math.max(0, book.chapters.length - 1)));
  const safeInitialOffset = initialOffset > 0 && initialOffset <= 1 ? initialOffset : 0;
  const safeInitialProgress = clamp(initialProgress, 0, 1);
  const vars = createEpubCssVars(settings, systemColorScheme);

  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>
${book.css}
:root { --reader-bg: ${vars.background}; --reader-fg: ${vars.foreground}; --reader-font-family: ${vars.fontFamily}; --reader-font-size: ${vars.fontSize}; --reader-line-height: ${vars.lineHeight}; --reader-padding: ${vars.padding}; }
html, body { margin: 0; padding: 0; background: var(--reader-bg); color: var(--reader-fg); font-family: var(--reader-font-family); }
body { -webkit-text-size-adjust: none; }
#root { min-height: 100vh; }
.chapter { box-sizing: border-box; padding: 24px var(--reader-padding) 40px; font-size: var(--reader-font-size); line-height: var(--reader-line-height); overflow-wrap: anywhere; }
.chapter img, .chapter svg { max-width: 100%; height: auto; }
.chapter p { line-height: var(--reader-line-height) !important; }
</style>
</head>
<body>
<div id="root"></div>
<script>
(function () {
  var chapters = ${JSON.stringify(book.chapters)};
  var root = document.getElementById('root');
  var topSpacer = document.createElement('div');
  var content = document.createElement('div');
  var bottomSpacer = document.createElement('div');
  var start = Math.max(0, ${safeInitialIndex} - 3);
  var end = Math.min(chapters.length, ${safeInitialIndex} + 3);
  var heightCache = {};
  var averageChapterHeight = Math.max(720, Math.round((window.innerHeight || 720) * 1.2));
  var topSpacerHeight = 0;
  var bottomSpacerHeight = 0;
  var isMutating = false;
  var lastProgressAt = 0;
  var suppressProgressUntil = Date.now() + 1200;
  var restoreTargetIndex = ${safeInitialIndex};
  var restoreTargetOffset = ${safeInitialOffset};
  var restoreTargetProgress = ${safeInitialProgress};
  var restoreLockUntil = restoreTargetProgress > 0.015 ? Date.now() + 4200 : 0;
  var restoreLocking = false;
  var restoreLayoutUntil = restoreTargetProgress > 0.015 ? Date.now() + 2600 : 0;
  var restoreFinalized = false;
  var touchStart = { x: 0, y: 0 };
  var moved = false;

  topSpacer.setAttribute('aria-hidden', 'true');
  bottomSpacer.setAttribute('aria-hidden', 'true');
  root.appendChild(topSpacer);
  root.appendChild(content);
  root.appendChild(bottomSpacer);

  function post(payload) {
    window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(payload));
  }

  function createChapterSection(index) {
    var chapter = chapters[index];
    var section = document.createElement('section');
    section.className = 'chapter';
    section.id = 'chapter-' + index;
    section.setAttribute('data-index', String(index));
    section.setAttribute('data-href', chapter.href);
    section.innerHTML = chapter.html;
    return section;
  }

  function cachedHeight(index) {
    return heightCache[index] || averageChapterHeight;
  }

  function rangeHeight(from, to) {
    var total = 0;
    for (var index = Math.max(0, from); index < Math.min(chapters.length, to); index += 1) {
      total += cachedHeight(index);
    }
    return total;
  }

  function measureRendered() {
    var sections = Array.prototype.slice.call(content.querySelectorAll('.chapter'));
    var total = 0;
    var count = 0;
    for (var index = 0; index < sections.length; index += 1) {
      var chapterIndex = Number(sections[index].getAttribute('data-index')) || 0;
      var height = Math.max(1, sections[index].offsetHeight || 0);
      heightCache[chapterIndex] = height;
      total += height;
      count += 1;
    }
    if (count > 0) {
      averageChapterHeight = Math.max(1, Math.round(total / count));
    }
  }

  function updateSpacers() {
    topSpacer.style.height = Math.max(0, Math.round(topSpacerHeight)) + 'px';
    bottomSpacer.style.height = Math.max(0, Math.round(bottomSpacerHeight)) + 'px';
  }

  function resetSpacerHeights() {
    topSpacerHeight = rangeHeight(0, start);
    bottomSpacerHeight = rangeHeight(end, chapters.length);
    updateSpacers();
  }

  function captureAnchor() {
    var section = currentChapter();
    if (!section) {
      return { y: window.scrollY || document.documentElement.scrollTop || 0 };
    }
    return {
      index: Number(section.getAttribute('data-index')) || 0,
      offset: (window.scrollY || document.documentElement.scrollTop || 0) - section.offsetTop,
    };
  }

  function restoreAnchor(anchor) {
    requestAnimationFrame(function () {
      if (anchor && typeof anchor.index === 'number') {
        var element = document.getElementById('chapter-' + anchor.index);
        if (element) {
          window.scrollTo(0, element.offsetTop + (anchor.offset || 0));
        } else if (typeof anchor.y === 'number') {
          window.scrollTo(0, anchor.y);
        }
      } else if (anchor && typeof anchor.y === 'number') {
        window.scrollTo(0, anchor.y);
      }
      setTimeout(function () {
        measureRendered();
        updateSpacers();
        isMutating = false;
        sendProgress();
        setTimeout(maybeLoadMore, 0);
      }, 60);
    });
  }

  function renderRange(nextStart, nextEnd, keepAnchor) {
    var previousY = window.scrollY || document.documentElement.scrollTop || 0;
    isMutating = true;
    start = Math.max(0, nextStart);
    end = Math.min(chapters.length, nextEnd);
    content.innerHTML = '';
    for (var index = start; index < end; index += 1) {
      content.appendChild(createChapterSection(index));
    }
    measureRendered();
    resetSpacerHeights();
    if (keepAnchor === 'preserve') {
      requestAnimationFrame(function () {
        window.scrollTo(0, previousY);
        setTimeout(function () {
          window.scrollTo(0, previousY);
          isMutating = false;
          sendProgress();
        }, 60);
      });
    } else {
      isMutating = false;
    }
  }

  function appendRange(nextEnd) {
    var targetEnd = Math.min(chapters.length, nextEnd);
    if (targetEnd <= end) return;
    var anchor = captureAnchor();
    isMutating = true;
    var previousEnd = end;
    for (var index = end; index < targetEnd; index += 1) {
      content.appendChild(createChapterSection(index));
    }
    end = targetEnd;
    measureRendered();
    resetSpacerHeights();
    recycleWindow(anchor);
    restoreAnchor(anchor);
  }

  function prependRange(nextStart) {
    if (Date.now() < restoreLayoutUntil) return;
    var targetStart = Math.max(0, nextStart);
    if (targetStart >= start) return;
    var anchor = captureAnchor();
    isMutating = true;
    var previousStart = start;
    for (var index = start - 1; index >= targetStart; index -= 1) {
      content.insertBefore(createChapterSection(index), content.firstChild);
    }
    start = targetStart;
    measureRendered();
    resetSpacerHeights();
    recycleWindow(anchor);
    restoreAnchor(anchor);
  }

  function recycleWindow(anchor) {
    if (Date.now() < restoreLayoutUntil) return;
    var section = anchor && typeof anchor.index === 'number' ? document.getElementById('chapter-' + anchor.index) : currentChapter();
    var currentIndex = section ? Number(section.getAttribute('data-index')) || start : start;
    var keepStart = Math.max(0, currentIndex - 4);
    var keepEnd = Math.min(chapters.length, currentIndex + 7);
    if (end - start <= 14) return;
    while (start < keepStart) {
      var first = document.getElementById('chapter-' + start);
      if (!first) break;
      heightCache[start] = Math.max(1, first.offsetHeight || cachedHeight(start));
      topSpacerHeight += heightCache[start];
      first.remove();
      start += 1;
    }
    while (end > keepEnd) {
      var lastIndex = end - 1;
      var last = document.getElementById('chapter-' + lastIndex);
      if (!last) break;
      heightCache[lastIndex] = Math.max(1, last.offsetHeight || cachedHeight(lastIndex));
      bottomSpacerHeight += heightCache[lastIndex];
      last.remove();
      end -= 1;
    }
    updateSpacers();
  }

  function ensureAround(index) {
    if (index < start || index >= end) {
      renderRange(Math.max(0, index - 1), Math.min(chapters.length, index + 4));
    }
  }

  function jumpTo(index) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    suppressProgressUntil = Date.now() + 700;
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    requestAnimationFrame(function () {
      var element = document.getElementById('chapter-' + index);
      if (element) element.scrollIntoView({ block: 'start' });
      setTimeout(function () {
        suppressProgressUntil = 0;
        sendProgress(true);
      }, 120);
    });
  }

  function jumpToOffset(index, offset, keepRestoreLock) {
    index = Math.max(0, Math.min(Number(index) || 0, chapters.length - 1));
    offset = Math.max(0, Math.min(1, Number(offset) || 0));
    if (!keepRestoreLock) {
      restoreLockUntil = 0;
      restoreLayoutUntil = 0;
    }
    suppressProgressUntil = Date.now() + 1200;
    renderRange(Math.max(0, index - 3), Math.min(chapters.length, index + 5));
    function applyScroll() {
      var element = document.getElementById('chapter-' + index);
      if (element) {
        var scrollableHeight = Math.max(1, element.offsetHeight - (window.innerHeight || 0));
        window.scrollTo(0, element.offsetTop + scrollableHeight * offset);
      }
    }
    requestAnimationFrame(function () {
      applyScroll();
      setTimeout(applyScroll, 120);
      setTimeout(function () {
        applyScroll();
        suppressProgressUntil = 0;
        sendProgress(true);
      }, 320);
    });
  }

  function waitForChapterLayout(index, callback) {
    var element = document.getElementById('chapter-' + index);
    if (!element) {
      callback();
      return;
    }
    var pendingImages = Array.prototype.slice.call(element.querySelectorAll('img')).filter(function (image) {
      return !image.complete;
    });
    var pending = pendingImages.length + 1;
    var done = false;
    var lastHeight = -1;
    var stableFrames = 0;

    function release() {
      pending -= 1;
      if (pending <= 0) waitForStableHeight();
    }

    function waitForStableHeight() {
      if (done) return;
      requestAnimationFrame(function () {
        var nextHeight = element.offsetHeight || 0;
        if (Math.abs(nextHeight - lastHeight) <= 1) stableFrames += 1;
        else stableFrames = 0;
        lastHeight = nextHeight;
        if (stableFrames >= 2) {
          done = true;
          callback();
          return;
        }
        waitForStableHeight();
      });
    }

    pendingImages.forEach(function (image) {
      image.addEventListener('load', release, { once: true });
      image.addEventListener('error', release, { once: true });
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(release).catch(release);
    } else {
      release();
    }
  }

  function finalizeInitialRestore() {
    if (restoreFinalized || restoreTargetProgress <= 0.015) return;
    waitForChapterLayout(restoreTargetIndex, function () {
      if (restoreFinalized) return;
      restoreFinalized = true;
      restoreLayoutUntil = 0;
      jumpToOffset(restoreTargetIndex, restoreTargetOffset, false);
    });
  }

  function enforceRestoreLock(currentProgress) {
    if (restoreLocking || Date.now() > restoreLockUntil || restoreTargetProgress <= 0.015) return false;
    if (currentProgress + 0.025 >= restoreTargetProgress) return false;
    restoreLocking = true;
    restoreLayoutUntil = Date.now() + 1200;
    suppressProgressUntil = Date.now() + 900;
    jumpToOffset(restoreTargetIndex, restoreTargetOffset, true);
    setTimeout(function () {
      restoreLocking = false;
    }, 980);
    return true;
  }

  function applySettings(vars) {
    var anchor = captureAnchor();
    isMutating = true;
    var style = document.documentElement.style;
    style.setProperty('--reader-bg', vars.background);
    style.setProperty('--reader-fg', vars.foreground);
    style.setProperty('--reader-font-family', vars.fontFamily);
    style.setProperty('--reader-font-size', vars.fontSize);
    style.setProperty('--reader-line-height', vars.lineHeight);
    style.setProperty('--reader-padding', vars.padding);
    document.body.style.background = vars.background;
    document.body.style.color = vars.foreground;
    restoreAnchor(anchor);
  }

  function maybeLoadMore() {
    if (isMutating) return;
    var y = window.scrollY || document.documentElement.scrollTop || 0;
    var viewport = window.innerHeight || document.documentElement.clientHeight || 0;
    var topHeight = topSpacer.offsetHeight || 0;
    var renderedBottom = content.offsetTop + content.offsetHeight;
    if (y < topHeight + viewport * 1.2 && start > 0) {
      prependRange(start - 4);
      return;
    }
    if (renderedBottom - (y + viewport) < viewport * 2 && end < chapters.length) {
      appendRange(end + 4);
    }
  }

  function currentChapter() {
    var marker = (window.scrollY || 0) + 4;
    var sections = Array.prototype.slice.call(document.querySelectorAll('.chapter'));
    var current = sections[0];
    for (var index = 0; index < sections.length; index += 1) {
      if (sections[index].offsetTop <= marker) current = sections[index];
      else break;
    }
    return current;
  }

  function sendProgress(force) {
    if (!force && Date.now() < suppressProgressUntil) return;
    var now = Date.now();
    if (!force && now - lastProgressAt < 100) return;
    lastProgressAt = now;
    var section = currentChapter();
    if (!section) return;
    var index = Number(section.getAttribute('data-index')) || 0;
    var top = section.offsetTop;
    var height = Math.max(1, section.offsetHeight - (window.innerHeight || 0));
    var local = Math.max(0, Math.min(1, ((window.scrollY || 0) - top) / height));
    var progress = chapters.length ? (index + local) / chapters.length : 0;
    if (enforceRestoreLock(progress)) return;
    post({ type: 'progress', progress: progress, index: index, href: section.getAttribute('data-href'), offset: local });
  }

  document.addEventListener('touchstart', function (event) {
    if (!event.touches || event.touches.length !== 1) return;
    restoreLockUntil = 0;
    restoreLayoutUntil = 0;
    moved = false;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, true);
  document.addEventListener('touchmove', function (event) {
    if (!event.touches || event.touches.length !== 1) return;
    if (Math.abs(event.touches[0].clientX - touchStart.x) > 8 || Math.abs(event.touches[0].clientY - touchStart.y) > 8) moved = true;
  }, true);
  document.addEventListener('touchend', function (event) {
    if (!moved) post({ type: 'tap' });
  }, true);
  document.addEventListener('click', function (event) {
    var image = event.target && event.target.closest && event.target.closest('img');
    if (image && image.src) {
      event.preventDefault();
      post({ type: 'image', src: image.src });
    }
  }, true);
  window.addEventListener('scroll', function () {
    maybeLoadMore();
    sendProgress();
  }, { passive: true });

  window.PointReader = { jumpTo: jumpTo, jumpToOffset: jumpToOffset, applySettings: applySettings };
  renderRange(start, end);
  requestAnimationFrame(function () {
    jumpToOffset(${safeInitialIndex}, ${safeInitialOffset}, true);
    finalizeInitialRestore();
  });
})();
</script>
</body>
</html>`;
}

const EpubPane = memo(function EpubPane({
  book,
  settings,
  systemColorScheme,
  location,
  readerKey,
  onToc,
  onProgress,
  onChapterChange,
  onToggleToolbar,
  onImagePress,
  onDisplayError,
}: {
  book: Book;
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  location?: string;
  readerKey: number;
  onToc: (toc: Toc) => void;
  onProgress: (progress: number, location?: Location | null, chapterTitle?: string) => void;
  onChapterChange: (title: string, href?: string) => void;
  onToggleToolbar: () => void;
  onImagePress: (uri: string) => void;
  onDisplayError: () => void;
}) {
  const defaultTheme = useMemo(() => createReaderTheme(settings, systemColorScheme), [settings, systemColorScheme]);
  const { goNext, goPrevious, goToLocation } = useReader();
  const epubOpenedRef = useRef(false);
  const restoringUntilRef = useRef(0);

  useEffect(() => {
    restoringUntilRef.current = location ? Date.now() + 2200 : 0;
  }, [location, readerKey]);

  useEffect(() => {
    epubOpenedRef.current = false;
    if (!location) return undefined;
    const timer = setTimeout(() => {
      if (!epubOpenedRef.current) {
        onDisplayError();
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [location, onDisplayError, readerKey]);

  const handleWebViewMessage = useCallback(
    (event: { type?: string; src?: unknown; progress?: unknown; location?: unknown; x?: unknown; width?: unknown }) => {
      if (event.type === 'point-reader:image-preview' && typeof event.src === 'string') {
        onImagePress(event.src);
      }
      if (event.type === 'point-reader:content-tap') {
        if (settings.mode !== 'tap') {
          onToggleToolbar();
          return;
        }
        const action = tapZoneAction(
          typeof event.x === 'number' ? event.x : Number.NaN,
          typeof event.width === 'number' ? event.width : Number.NaN,
          settings.swapTapZones
        );
        if (action === 'previous') {
          goPrevious();
        } else if (action === 'next') {
          goNext();
        } else {
          onToggleToolbar();
        }
      }
      if (event.type === 'point-reader:reader-error') {
        console.warn('[PointReader EPUB]', event);
      }
      if (event.type === 'point-reader:reading-progress' && typeof event.progress === 'number') {
        epubOpenedRef.current = true;
        if (settings.mode === 'scroll') {
          if (Date.now() < restoringUntilRef.current && isLikelyCoverLocation(event.location as Location)) {
            return;
          }
          onProgress(normalizeEpubProgress(event.progress), event.location as Location);
        }
      }
    },
    [goNext, goPrevious, onImagePress, onProgress, onToggleToolbar, settings.mode, settings.swapTapZones]
  );

  return (
    <Reader
      key={`${book.id}-${readerKey}`}
      src={book.fileUri}
      width="100%"
      height="100%"
      fileSystem={useLegacyEpubFileSystem}
      initialLocation={location}
      flow={settings.mode === 'scroll' ? 'scrolled-continuous' : 'paginated'}
      manager={settings.mode === 'scroll' ? 'continuous' : 'default'}
      enableSwipe={settings.mode === 'tap'}
      defaultTheme={defaultTheme}
      onNavigationLoaded={({ toc }) => onToc(toc)}
      onDisplayError={onDisplayError}
      onReady={() => {
        epubOpenedRef.current = true;
        if (location) {
          setTimeout(() => goToLocation(location), 80);
          setTimeout(() => goToLocation(location), 420);
        }
      }}
      onLocationChange={(_, currentLocation, progress, section) => {
        epubOpenedRef.current = true;
        if (Date.now() < restoringUntilRef.current && isLikelyCoverLocation(currentLocation)) {
          return;
        }
        if (section?.label) {
          onChapterChange(section.label, currentLocation?.start?.href || section.href);
        }
        if (settings.mode !== 'scroll') {
          onProgress(normalizeEpubProgress(progress), currentLocation, section?.label);
        }
      }}
      injectedJavascript={EPUB_IMAGE_PREVIEW_SCRIPT}
      onWebViewMessage={handleWebViewMessage}
    />
  );
});

function normalizeEpubProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0;
  return progress > 1 ? progress / 100 : progress;
}

function disabledToolColor(color: string) {
  return color.startsWith('#') ? `${color}66` : 'rgba(120,120,120,0.45)';
}

function chaptersForSheet(format: Book['format'], epubToc: Toc, chapters: ReaderChapter[]) {
  if (format === 'epub') {
    return epubToc
      .map((item) => ({
        id: item.href,
        title: (item.label || '').trim(),
        text: '',
        href: item.href,
      }))
      .filter((chapter) => chapter.title.length > 0);
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

function isLikelyCoverLocation(location?: Location | null) {
  const href = normalizeEpubHref(location?.start?.href);
  return href === 'cover.xhtml' || href === 'title.xhtml';
}

function normalizeEpubHref(href?: string | null) {
  if (!href) return '';
  return href.split('#')[0].replace(/^.*\/([^/]+)$/, '$1');
}

function normalizeEpubDisplayHref(href?: string | null) {
  if (!href) return '';
  return href.replace(/^(\.\.\/)+/, '').replace(/^\/+/, '');
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
  foregroundColor,
  onProgress,
  onToggleToolbar,
}: {
  book: Book;
  chapters: ReaderChapter[];
  settings: ReadingSettings;
  foregroundColor: string;
  onProgress: (progress: number, chapter: number, offset: number) => void;
  onToggleToolbar: () => void;
}) {
  const [index, setIndex] = useState(book.currentChapter);
  const chapter = chapters[index] ?? chapters[0];
  const { width } = useWindowDimensions();
  const isDragging = useRef(false);
  const touchStart = useRef({ x: 0, y: 0 });

  const move = (delta: number) => {
    const next = Math.max(0, Math.min(chapters.length - 1, index + delta));
    setIndex(next);
    onProgress(chapters.length ? next / chapters.length : 0, next, 0);
  };

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
            if (action === 'previous') {
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
        <View style={styles.pageButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="上一章"
            onPress={() => move(settings.swapTapZones ? 1 : -1)}
            style={styles.pageButton}>
            <ChevronLeft size={24} color={foregroundColor} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="下一章"
            onPress={() => move(settings.swapTapZones ? -1 : 1)}
            style={styles.pageButton}>
            <ChevronRight size={24} color={foregroundColor} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function ReaderSheet({
  sheet,
  settings,
  systemColorScheme,
  colors,
  disabledSheets = [],
  progress,
  chapters,
  hasChapters,
  currentChapterIndex,
  currentChapterHref,
  onSelectChapter,
  onSettings,
  onStyleChange,
  onSeekProgress,
  resolveChapterIndex,
}: {
  sheet: 'toc' | 'theme' | 'progress' | 'font';
  settings: ReadingSettings;
  systemColorScheme?: 'light' | 'dark' | null;
  colors: AppColors;
  disabledSheets?: ('theme' | 'font')[];
  progress: number;
  chapters: ReaderChapter[];
  hasChapters: boolean;
  currentChapterIndex: number;
  currentChapterHref?: string;
  onSelectChapter: (index: number, href?: string) => void;
  onSettings: (patch: Partial<ReadingSettings>) => void;
  onStyleChange: () => void;
  onSeekProgress: (progress: number) => void;
  resolveChapterIndex?: (href: string | undefined, fallbackIndex: number) => number;
}) {
  const { changeTheme, injectJavascript } = useReader();
  const [localSettings, setLocalSettings] = useState(settings);
  const tocListRef = useRef<ScrollView>(null);
  const themeDisabled = disabledSheets.includes('theme');
  const fontDisabled = disabledSheets.includes('font');
  const sheetTitle = {
    toc: '章节',
    theme: '背景',
    progress: '进度',
    font: '字体',
  }[sheet];

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const applyThemeSettings = (patch: Partial<ReadingSettings>) => {
    const nextSettings = { ...localSettings, ...patch };
    setLocalSettings(nextSettings);
    onStyleChange();
    onSettings(patch);
    changeTheme(createReaderTheme(nextSettings, systemColorScheme));
  };

  const applyFontSettings = (patch: Partial<ReadingSettings>) => {
    const nextSettings = { ...localSettings, ...patch };
    setLocalSettings(nextSettings);
    onStyleChange();
    onSettings(patch);
    changeTheme(createReaderTheme(nextSettings, systemColorScheme));
  };

  useEffect(() => {
    if (sheet !== 'toc' || !hasChapters || !chapters.length) return;
    const hrefIndex = currentChapterHref
      ? chapters.findIndex((chapter) => isSameEpubHref(chapter.href, currentChapterHref))
      : -1;
    const targetIndex = hrefIndex >= 0 ? hrefIndex : clamp(currentChapterIndex, 0, chapters.length - 1);
    const timer = setTimeout(() => {
      tocListRef.current?.scrollTo({
        y: Math.max(0, targetIndex * TouchTarget - TouchTarget * 2),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [chapters, currentChapterHref, currentChapterIndex, hasChapters, sheet]);

  return (
    <View style={[styles.sheet, { backgroundColor: colors.surface, shadowColor: colors.text }]}>
      <View style={[styles.sheetTitleWrap, { borderBottomColor: colors.backgroundElement }]}>
        <Text style={[styles.sheetTitle, { color: colors.text }]}>{sheetTitle}</Text>
      </View>
      {sheet === 'toc' ? (
        hasChapters ? (
          <ScrollView ref={tocListRef} style={styles.tocList}>
            {chapters.map((chapter, index) => {
            const isCurrent = currentChapterHref
              ? isSameEpubHref(chapter.href, currentChapterHref)
              : index === currentChapterIndex;
            return (
              <Pressable
                key={`${chapter.id}-${index}`}
                accessibilityRole="button"
                accessibilityLabel={chapter.title}
                accessibilityState={{ selected: isCurrent }}
                onPress={() => {
                  const targetHref = normalizeEpubDisplayHref(chapter.href);
                  if (targetHref) {
                    injectJavascript(`
                      setTimeout(function () {
                        var target = ${JSON.stringify(targetHref)};
                        if (typeof rendition === 'undefined' || !rendition) return;
                        window.__pointReaderJumpGeneration = (window.__pointReaderJumpGeneration || 0) + 1;
                        var jumpId = window.__pointReaderJumpGeneration;
                        window.__pointReaderLastUserScrollAt = 0;
                        window.__pointReaderSuppressProgressUntil = Date.now() + 3500;
                        function reportJumpProgress() {
                          window.__pointReaderSuppressProgressUntil = 0;
                          if (typeof window.__pointReaderScheduleReadingProgress === 'function') {
                            window.__pointReaderScheduleReadingProgress();
                            setTimeout(window.__pointReaderScheduleReadingProgress, 180);
                          }
                        }
                        function waitForStableLayoutThenRedisplay(attempt, lastHeight, lastViewCount, stableCount) {
                          if (window.__pointReaderJumpGeneration !== jumpId) return;
                          if (Date.now() - (window.__pointReaderLastUserScrollAt || 0) < 250) {
                            window.__pointReaderSuppressProgressUntil = 0;
                            return;
                          }
                          var manager = rendition.manager || {};
                          var container = manager.container;
                          var height = container ? container.scrollHeight : 0;
                          var viewCount = manager.views && manager.views.all ? manager.views.all().length : 0;
                          var nextStableCount = height === lastHeight && viewCount === lastViewCount ? stableCount + 1 : 0;
                          if (nextStableCount >= 3 || attempt >= 18) {
                            Promise.resolve(rendition.display(target))
                              .then(function () {
                                setTimeout(reportJumpProgress, 220);
                              })
                              .catch(function () {
                                rendition.display('../' + target).then(function () {
                                  setTimeout(reportJumpProgress, 220);
                                });
                              });
                            return;
                          }
                          setTimeout(function () {
                            waitForStableLayoutThenRedisplay(attempt + 1, height, viewCount, nextStableCount);
                          }, 120);
                        }
                        Promise.resolve(rendition.display(target))
                          .then(function () {
                            setTimeout(function () {
                              waitForStableLayoutThenRedisplay(0, -1, -1, 0);
                            }, 240);
                          })
                          .catch(function () {
                            rendition.display('../' + target)
                              .then(function () {
                                setTimeout(function () {
                                  waitForStableLayoutThenRedisplay(0, -1, -1, 0);
                                }, 240);
                              })
                              .catch(function (error) {
                                window.__pointReaderSuppressProgressUntil = 0;
                                if (typeof window.__pointReaderSendReaderError === 'function') {
                                  window.__pointReaderSendReaderError(error && (error.message || error));
                                }
                              });
                          });
                      }, 0);
                      true;
                    `);
                  }
                  onSelectChapter(resolveChapterIndex?.(targetHref || chapter.href, index) ?? index, targetHref || chapter.href);
                }}
                style={[styles.tocItem, { borderBottomColor: colors.backgroundElement }, isCurrent && { backgroundColor: colors.backgroundElement }]}>
                <Text style={[styles.tocTitle, { color: colors.text }, isCurrent && styles.tocTitleCurrent]} numberOfLines={2}>
                  {chapter.title}
                </Text>
              </Pressable>
            );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyToc}>
            <Text style={[styles.emptyTocText, { color: colors.textSecondary }]}>暂无章节信息</Text>
          </View>
        )
      ) : null}
      {sheet === 'theme' && !themeDisabled ? (
        <View style={styles.swatches}>
          {(['white', 'gray', 'yellow', 'green'] as ReadingSettings['background'][]).map((name) => (
            <Pressable
              key={name}
              accessibilityRole="button"
              accessibilityLabel={`背景 ${name}`}
              onPress={() => {
                applyThemeSettings({ background: name });
              }}
              style={[
                styles.swatch,
                { backgroundColor: readerBackgrounds[name] },
                { borderColor: colors.border },
                localSettings.background === name && [styles.swatchSelected, { borderColor: colors.text }],
              ]}
            />
          ))}
        </View>
      ) : null}
      {sheet === 'progress' ? (
        <ProgressPanel
          colors={colors}
          progress={progress}
          onSeek={onSeekProgress}
          onPreviousChapter={() => {
            const nextIndex = Math.max(0, currentChapterIndex - 1);
            const nextProgress = chapters.length ? nextIndex / chapters.length : 0;
            onSeekProgress(nextProgress);
          }}
          onNextChapter={() => {
            const nextIndex = Math.min(Math.max(0, chapters.length - 1), currentChapterIndex + 1);
            const nextProgress = chapters.length ? nextIndex / chapters.length : 1;
            onSeekProgress(nextProgress);
          }}
        />
      ) : null}
      {sheet === 'font' && !fontDisabled ? (
        <View style={styles.fontPanel}>
          <ReaderMetricControl
            colors={colors}
            value={localSettings.fontSize}
            min={16}
            max={32}
            step={1}
            leftLabel="A"
            rightLabel="A"
            valueLabel={`${localSettings.fontSize}`}
            accessibilityLabel="文字大小"
            onValue={(value) => applyFontSettings({ fontSize: value })}
          />
          <View style={styles.metricGrid}>
            <ReaderMetricControl
              colors={colors}
              value={localSettings.paddingScale}
              min={0.5}
              max={1.8}
              step={0.1}
              leftLabel="小"
              rightLabel="大"
              valueLabel="边距"
              icon={SquareDashed}
              compact
              accessibilityLabel="文字内边距"
              onValue={(value) => applyFontSettings({ paddingScale: value })}
            />
            <ReaderMetricControl
              colors={colors}
              value={localSettings.lineHeightScale}
              min={1.2}
              max={1.9}
              step={0.05}
              leftLabel="小"
              rightLabel="大"
              valueLabel="行高"
              icon={ListChevronsUpDown}
              compact
              accessibilityLabel="行高"
              onValue={(value) => applyFontSettings({ lineHeightScale: value })}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProgressPanel({
  progress,
  colors,
  onSeek,
  onPreviousChapter,
  onNextChapter,
}: {
  progress: number;
  colors: AppColors;
  onSeek: (progress: number) => void;
  onPreviousChapter: () => void;
  onNextChapter: () => void;
}) {
  const undoProgress = useRef<number | null>(null);
  const redoProgress = useRef<number | null>(null);
  const currentProgress = useRef(progress);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  useEffect(() => {
    currentProgress.current = progress;
  }, [progress]);

  const commitSeek = useCallback(
    (nextProgress: number) => {
      const clampedProgress = clamp(nextProgress, 0, 1);
      undoProgress.current = currentProgress.current;
      redoProgress.current = null;
      currentProgress.current = clampedProgress;
      setCanUndo(true);
      setCanRedo(false);
      onSeek(clampedProgress);
    },
    [onSeek]
  );

  const seekBy = useCallback(
    (delta: number) => {
      commitSeek(currentProgress.current + delta);
    },
    [commitSeek]
  );

  const undo = useCallback(() => {
    if (undoProgress.current === null) return;
    redoProgress.current = currentProgress.current;
    const target = undoProgress.current;
    undoProgress.current = null;
    currentProgress.current = target;
    setCanUndo(false);
    setCanRedo(true);
    onSeek(target);
  }, [onSeek]);

  const redo = useCallback(() => {
    if (redoProgress.current === null) return;
    undoProgress.current = currentProgress.current;
    const target = redoProgress.current;
    redoProgress.current = null;
    currentProgress.current = target;
    setCanUndo(true);
    setCanRedo(false);
    onSeek(target);
  }, [onSeek]);

  const jumpChapter = useCallback(
    (direction: -1 | 1) => {
      undoProgress.current = currentProgress.current;
      redoProgress.current = null;
      setCanUndo(true);
      setCanRedo(false);
      if (direction < 0) onPreviousChapter();
      else onNextChapter();
    },
    [onNextChapter, onPreviousChapter]
  );

  return (
    <View style={styles.progressPanel}>
      <ReaderProgressControl value={progress} colors={colors} onValue={commitSeek} />
      <View style={styles.progressActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="上一章" onPress={() => jumpChapter(-1)} style={styles.progressActionButton}>
          <ChevronsLeft size={28} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="后退一点" onPress={() => seekBy(-0.01)} style={styles.progressActionButton}>
          <ChevronLeft size={30} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="撤销跳转"
          accessibilityState={{ disabled: !canUndo }}
          disabled={!canUndo}
          onPress={undo}
          style={styles.progressActionButton}>
          <RotateCcw size={30} color={canUndo ? colors.text : colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="重做跳转"
          accessibilityState={{ disabled: !canRedo }}
          disabled={!canRedo}
          onPress={redo}
          style={styles.progressActionButton}>
          <RotateCw size={30} color={canRedo ? colors.text : colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="前进一点" onPress={() => seekBy(0.01)} style={styles.progressActionButton}>
          <ChevronRight size={30} color={colors.text} strokeWidth={2.6} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="下一章" onPress={() => jumpChapter(1)} style={styles.progressActionButton}>
          <ChevronsRight size={28} color={colors.text} strokeWidth={2.6} />
        </Pressable>
      </View>
    </View>
  );
}

function ProgressToolIcon({ color, backgroundColor }: { color: string; backgroundColor: string }) {
  return (
    <View style={styles.progressToolIcon} accessibilityElementsHidden>
      <View style={[styles.progressToolIconLine, { backgroundColor: color }]} />
      <View style={[styles.progressToolIconKnob, { borderColor: color, backgroundColor }]} />
    </View>
  );
}

function ReaderProgressControl({ value, colors, onValue }: { value: number; colors: AppColors; onValue: (value: number) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const [localValue, setLocalValue] = useState(value);
  const localValueRef = useRef(value);
  const dragging = useRef(false);
  const controlRef = useRef<View>(null);
  const controlPageX = useRef(0);
  const thumbWidth = 56;
  const travelWidth = Math.max(1, trackWidth - thumbWidth);
  const thumbLeft = clamp(localValue, 0, 1) * travelWidth;

  useEffect(() => {
    if (dragging.current) return;
    localValueRef.current = value;
    setLocalValue(value);
  }, [value]);

  const updateValueFromTrackX = useCallback(
    (x: number) => {
      if (!trackWidth) return;
      const ratio = clamp((x - thumbWidth / 2) / travelWidth, 0, 1);
      localValueRef.current = ratio;
      setLocalValue(ratio);
    },
    [thumbWidth, trackWidth, travelWidth]
  );

  const updateControlPageX = useCallback(() => {
    controlRef.current?.measureInWindow((x) => {
      controlPageX.current = x;
    });
  }, []);

  const updateValueFromPageX = useCallback(
    (pageX: number) => {
      updateValueFromTrackX(pageX - controlPageX.current);
    },
    [updateValueFromTrackX]
  );

  const commit = useCallback(() => {
    onValue(clamp(localValueRef.current, 0, 1));
  }, [onValue]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onShouldBlockNativeResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (event) => {
          dragging.current = true;
          controlRef.current?.measureInWindow((x) => {
            controlPageX.current = x;
            updateValueFromPageX(event.nativeEvent.pageX);
          });
        },
        onPanResponderMove: (_, gestureState) => {
          updateValueFromPageX(gestureState.moveX);
        },
        onPanResponderRelease: () => {
          dragging.current = false;
          commit();
        },
        onPanResponderTerminate: () => {
          dragging.current = false;
          commit();
        },
      }),
    [commit, updateValueFromPageX]
  );

  return (
    <View
      ref={controlRef}
      accessibilityRole="adjustable"
      accessibilityLabel="阅读进度"
      accessibilityValue={{ text: `${Math.round(localValue * 100)}%` }}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'increment') onValue(clamp(value + 0.01, 0, 1));
        if (event.nativeEvent.actionName === 'decrement') onValue(clamp(value - 0.01, 0, 1));
      }}
      accessibilityActions={[
        { name: 'increment', label: '前进' },
        { name: 'decrement', label: '后退' },
      ]}
      onLayout={(event) => {
        setTrackWidth(event.nativeEvent.layout.width);
        updateControlPageX();
      }}
      style={[styles.progressTrack, { backgroundColor: colors.backgroundElement }]}
      {...panResponder.panHandlers}>
      <View pointerEvents="none" style={[styles.progressTrackFill, { backgroundColor: colors.backgroundSelected, width: trackWidth ? thumbLeft + thumbWidth / 2 : 0 }]} />
      <View pointerEvents="none" style={[styles.progressThumb, { backgroundColor: colors.surface, shadowColor: colors.text }, trackWidth > 0 && { left: thumbLeft, width: thumbWidth }]}>
        <Text style={[styles.progressThumbText, { color: colors.text }]}>{`${Math.round(localValue * 100)}%`}</Text>
      </View>
    </View>
  );
}

function BatteryBadge({ value, color }: { value: number | null; color: string }) {
  const batteryText = value === null ? '--' : String(Math.round(clamp(value, 0, 100)));

  return (
    <View style={styles.batteryBadge} accessibilityLabel={`电量 ${value === null ? '未知' : `${value}%`}`}>
      <View style={[styles.batteryBody, { borderColor: color }]}>
        <Text style={[styles.batteryBadgeText, { color }]}>{batteryText}</Text>
      </View>
      <View style={[styles.batteryCap, { borderColor: color }]} />
    </View>
  );
}

function ImagePreviewModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scaleValue = useRef(1);
  const offsetValue = useRef({ x: 0, y: 0 });
  const panStart = useRef({ x: 0, y: 0 });
  const pinchStartDistance = useRef(0);
  const pinchStartScale = useRef(1);
  const tapStart = useRef({ x: 0, y: 0, time: 0 });
  const didPinch = useRef(false);
  const didDrag = useRef(false);

  useEffect(() => {
    scaleValue.current = 1;
    offsetValue.current = { x: 0, y: 0 };
    panStart.current = { x: 0, y: 0 };
    pinchStartDistance.current = 0;
    pinchStartScale.current = 1;
    didPinch.current = false;
    didDrag.current = false;
    scale.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
  }, [scale, translateX, translateY, uri]);

  const setPreviewOffset = useCallback(
    (x: number, y: number, nextScale = scaleValue.current) => {
      const maxX = Math.max(0, (width * (nextScale - 1)) / 2);
      const maxY = Math.max(0, (height * (nextScale - 1)) / 2);
      const nextX = clamp(x, -maxX, maxX);
      const nextY = clamp(y, -maxY, maxY);
      offsetValue.current = { x: nextX, y: nextY };
      translateX.setValue(nextX);
      translateY.setValue(nextY);
    },
    [height, translateX, translateY, width]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: (event) => {
          const touches = event.nativeEvent.touches;
          didPinch.current = touches.length >= 2;
          if (touches.length >= 2) {
            pinchStartDistance.current = distanceBetweenTouches(touches);
            pinchStartScale.current = scaleValue.current;
            return;
          }
          didDrag.current = false;
          panStart.current = offsetValue.current;
          tapStart.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
            time: Date.now(),
          };
        },
        onPanResponderMove: (event, gestureState) => {
          const touches = event.nativeEvent.touches;
          if (touches.length < 2) {
            if (scaleValue.current <= MIN_PREVIEW_SCALE) return;
            if (Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3) {
              didDrag.current = true;
            }
            setPreviewOffset(panStart.current.x + gestureState.dx, panStart.current.y + gestureState.dy);
            return;
          }
          didPinch.current = true;
          const nextDistance = distanceBetweenTouches(touches);
          if (!pinchStartDistance.current || !nextDistance) return;
          const nextScale = clamp(
            pinchStartScale.current * (nextDistance / pinchStartDistance.current),
            MIN_PREVIEW_SCALE,
            MAX_PREVIEW_SCALE
          );
          scaleValue.current = nextScale;
          scale.setValue(nextScale);
          setPreviewOffset(offsetValue.current.x, offsetValue.current.y, nextScale);
        },
        onPanResponderRelease: (event) => {
          if (didPinch.current) {
            didPinch.current = false;
            return;
          }

          if (didDrag.current) {
            didDrag.current = false;
            return;
          }

          const dx = Math.abs(event.nativeEvent.pageX - tapStart.current.x);
          const dy = Math.abs(event.nativeEvent.pageY - tapStart.current.y);
          const duration = Date.now() - tapStart.current.time;
          if (dx < 10 && dy < 10 && duration < 360) {
            onClose();
          }
        },
        onPanResponderTerminate: () => {
          didPinch.current = false;
          didDrag.current = false;
        },
      }),
    [onClose, scale, setPreviewOffset]
  );

  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <View
        accessible
        accessibilityRole="imagebutton"
        accessibilityLabel="图片预览，点击关闭"
        style={styles.previewBackdrop}
        {...panResponder.panHandlers}>
        {uri ? (
          <Animated.View style={[styles.previewImageFrame, { transform: [{ translateX }, { translateY }, { scale }] }]}>
            <Image source={{ uri }} resizeMode="contain" style={styles.previewImage} />
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

function distanceBetweenTouches(touches: readonly { pageX: number; pageY: number }[]) {
  if (touches.length < 2) return 0;
  const [first, second] = touches;
  return Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY);
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
  progressToolIcon: {
    position: 'relative',
    width: 31,
    height: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressToolIconLine: {
    width: 30,
    height: 3,
    borderRadius: 2,
  },
  progressToolIconKnob: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 7,
    borderWidth: 3,
    backgroundColor: Colors.light.surface,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: READER_TOOLBAR_HEIGHT,
    maxHeight: '42%',
    backgroundColor: Colors.light.surface,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.four,
    gap: Spacing.two,
    zIndex: 20,
    shadowColor: Colors.light.text,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 14,
    elevation: 10,
  },
  sheetTitle: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '800',
  },
  sheetTitleWrap: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    marginBottom: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundElement,
  },
  tocList: {
    maxHeight: 320,
  },
  emptyToc: {
    minHeight: 132,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTocText: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
  },
  tocItem: {
    minHeight: TouchTarget,
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.light.backgroundElement,
  },
  tocItemCurrent: {
    backgroundColor: Colors.light.backgroundElement,
  },
  tocTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: Colors.light.text,
  },
  tocTitleCurrent: {
    fontWeight: '700',
  },
  swatches: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  swatch: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: Colors.light.border,
  },
  swatchSelected: {
    borderWidth: 3,
    borderColor: Colors.light.text,
  },
  progressPanel: {
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  progressTrack: {
    position: 'relative',
    height: 50,
    borderRadius: 25,
    backgroundColor: Colors.light.backgroundElement,
    overflow: 'visible',
  },
  progressTrackFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 25,
    backgroundColor: 'rgba(28,25,23,0.08)',
  },
  progressThumb: {
    position: 'absolute',
    top: -3,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.light.surface,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.light.text,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  progressThumbText: {
    fontSize: 15,
    lineHeight: 18,
    fontWeight: '500',
    color: Colors.light.text,
  },
  progressActions: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progressActionButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontPanel: {
    gap: Spacing.four,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: Spacing.four,
  },
  tapPane: {
    flex: 1,
  },
  pageButtons: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pageButton: {
    width: 58,
    height: 58,
    borderRadius: Radius.medium,
    borderWidth: 1,
    borderColor: 'rgba(28,25,23,0.4)',
    backgroundColor: 'rgba(255,255,255,0.68)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(246,244,238,0.98)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  previewImageFrame: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
});
